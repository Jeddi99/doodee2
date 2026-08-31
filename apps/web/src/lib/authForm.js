// Validation and error wording for the email/password form, kept out of the component so it
// can be tested without a browser or a Firebase project.

// Firebase enforces a six-character minimum of its own. Checking it here too means the common
// mistake is caught before a network round trip, and the message is in the user's language.
export const MIN_PASSWORD = 8;

export function isEmail(value) {
  const email = String(value || '').trim();
  // Deliberately loose: the only authority on whether an address exists is whether mail to it
  // arrives, so anything stricter just rejects valid unusual addresses.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function passwordProblem(password) {
  const value = String(password || '');
  if (value.length < MIN_PASSWORD) return 'short';
  return null;
}

/** What is wrong with the form right now, or null when it may be submitted. */
export function formProblem({ email, password, confirmPassword, displayName, mode }) {
  if (mode === 'signup') {
    if (displayName !== undefined && !String(displayName || '').trim()) return 'name';
  }
  if (!isEmail(email)) return 'email';
  if (mode === 'signup') {
    const prob = passwordProblem(password);
    if (prob) return prob;
    if (confirmPassword !== undefined && password !== confirmPassword) return 'passwordMismatch';
    return null;
  }
  if (!password) return 'short';
  return null;
}

// Firebase returns machine codes; users get told what to do about them. Anything unmapped
// falls through to a generic message rather than showing `auth/internal-error` to a person.
const CODES = {
  'auth/email-already-in-use': 'emailInUse',
  'auth/invalid-email': 'invalidEmail',
  'auth/weak-password': 'weakPassword',
  // Firebase collapses "no such user" and "wrong password" into one code on newer projects,
  // deliberately, so an attacker cannot use the form to discover which emails are registered.
  // The wording has to stay just as vague or it leaks what Firebase went out of its way to hide.
  'auth/invalid-credential': 'badCredentials',
  'auth/wrong-password': 'badCredentials',
  'auth/user-not-found': 'badCredentials',
  'auth/user-disabled': 'disabled',
  'auth/too-many-requests': 'tooMany',
  'auth/network-request-failed': 'network',
  'auth/popup-closed-by-user': 'popupClosed',
  // The sign-in method is off in the Firebase console. Says so plainly, because this one is
  // an operator mistake and the user can do nothing about it.
  'auth/operation-not-allowed': 'methodDisabled',
};

export function authErrorKey(error) {
  return CODES[error?.code] || 'generic';
}
