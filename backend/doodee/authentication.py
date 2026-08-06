import os

import firebase_admin
from django.contrib.auth.models import User
from firebase_admin import auth
from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework.exceptions import AuthenticationFailed

from .models import FirebaseIdentity


def _firebase_app():
    try:
        return firebase_admin.get_app("doodee")
    except ValueError:
        return firebase_admin.initialize_app(
            options={"projectId": os.environ["FIREBASE_PROJECT_ID"]},
            name="doodee",
        )


class FirebaseAuthentication(BaseAuthentication):
    def authenticate(self, request):
        header = get_authorization_header(request).split()
        if not header:
            return None
        if len(header) != 2 or header[0].lower() != b"bearer":
            raise AuthenticationFailed("Invalid Authorization header")
        from django.conf import settings

        token_str = header[1].decode()
        if settings.DEBUG and token_str == "dev-guest-token":
            user, _ = User.objects.get_or_create(
                username="firebase:dev-guest-uid",
                defaults={"email": "guest@example.com"}
            )
            FirebaseIdentity.objects.get_or_create(user=user, defaults={"firebase_uid": "dev-guest-uid"})
            return user, {"uid": "dev-guest-uid", "email": "guest@example.com"}

        try:
            token = auth.verify_id_token(token_str, app=_firebase_app())
        except Exception as exc:
            raise AuthenticationFailed("Invalid Firebase token") from exc

        uid = token.get("uid")
        if not uid:
            raise AuthenticationFailed("Firebase token has no uid")
        identity = FirebaseIdentity.objects.select_related("user").filter(firebase_uid=uid).first()
        if identity:
            if not identity.user.is_active:
                raise AuthenticationFailed("Account is disabled")
            return identity.user, token

        user = User.objects.create_user(
            username=f"firebase:{uid}",
            email=token.get("email", ""),
            password=None,
        )
        FirebaseIdentity.objects.create(user=user, firebase_uid=uid)
        return user, token

