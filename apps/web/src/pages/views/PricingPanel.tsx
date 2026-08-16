import { useQuery } from "@tanstack/react-query";
import { Check, Minus } from "lucide-react";
import { GlassCard } from "../DashboardPage";
import { getSession } from "../../lib/api";

/**
 * In-app plans, rebuilt on qijek's GlassCard and price-plan rhythm.
 *
 * There is still no checkout: README states no payment webhooks are implemented, so the CTA on a
 * paid plan says so rather than pretending to start a purchase.
 */
const FEATURES = [
  ["single-reference", "Single consultation reference"],
  ["multi-reference", "Multiple reference images"],
  ["try-on", "Hair / eye / lip try-on"],
  ["report", "Personal report guidance"],
  ["questions", "Prioritised consultation questions"],
  ["pdf", "PDF report"],
  ["tracking", "Progress tracking"],
  ["compare", "Multi-photo comparison"],
] as const;

type Plan = {
  id: string;
  name: string;
  price: string;
  body: string;
  featured?: boolean;
  included: readonly string[];
};

const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: "฿0",
    body: "A personal trial without reference images.",
    included: ["report", "questions"],
  },
  {
    id: "plus",
    name: "Plus",
    price: "฿149",
    body: "Ten scans, five references, try-on, PDF and tracking.",
    featured: true,
    included: ["single-reference", "multi-reference", "try-on", "report", "questions", "pdf", "tracking"],
  },
  {
    id: "pro",
    name: "Pro",
    price: "฿299",
    body: "Thirty scans, twenty references and complete tracking.",
    included: FEATURES.map(([id]) => id),
  },
];

export default function PricingPanel() {
  const session = useQuery({ queryKey: ["session"], queryFn: getSession });
  const currentPlan = session.data?.plan;

  return (
    <div className="app-view pricing-view">
      <div className="app-page-title">
        <span className="eyebrow">Plans</span>
        <h1>Start with clarity.</h1>
        <p>Every plan uses the same measurements. Paid plans add references and reports.</p>
      </div>

      <div className="price-plans">
        {PLANS.map((plan) => {
          const isCurrent = currentPlan === plan.id;
          return (
            <GlassCard
              className={`pricing-plan${plan.featured ? " plan-featured" : ""}${isCurrent ? " is-current" : ""}`}
              key={plan.id}
            >
              {plan.featured && <span className="price-badge">Recommended</span>}
              <div className="price-copy">
                <h3>{plan.name}</h3>
                <strong>
                  {plan.price}
                  {plan.id !== "free" && <small>/month</small>}
                </strong>
                <p>{plan.body}</p>
              </div>
              <ul>
                {FEATURES.map(([id, label]) => {
                  const included = plan.included.includes(id);
                  return (
                    <li className={included ? "" : "is-excluded"} key={id}>
                      {included ? <Check /> : <Minus />}
                      {label}
                    </li>
                  );
                })}
              </ul>
              {isCurrent ? (
                <span className="pricing-current" role="status">
                  Your current plan
                </span>
              ) : plan.id === "free" ? (
                <span className="pricing-current">Included</span>
              ) : (
                /* No billing provider is wired up, so this states the position instead of
                   opening a checkout that cannot complete. */
                <span className="pricing-unavailable">Checkout is not available yet</span>
              )}
            </GlassCard>
          );
        })}
      </div>

      <p className="pricing-note">
        Free accounts get three simulation previews a month. Saving a full image is capped at
        three per month on every plan.
      </p>
    </div>
  );
}
