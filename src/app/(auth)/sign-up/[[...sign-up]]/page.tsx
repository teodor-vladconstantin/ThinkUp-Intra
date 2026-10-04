import { SignUp } from "@clerk/nextjs";

// Reachable only through an invitation link: Clerk is in "Restricted" sign-up mode,
// so <SignUp /> accepts a visitor only when the URL carries a valid invitation ticket.
export default function SignUpPage() {
  return <SignUp />;
}
