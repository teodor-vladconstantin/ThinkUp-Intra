import { notFound } from "next/navigation";
import { z } from "zod";
import { PersonView } from "@/components/platform/person-view";
import { requirePlatformProfile } from "@/lib/platform";

export default async function PersonPage(props: PageProps<"/platform/people/[id]">) {
  const me = await requirePlatformProfile();
  const id = z.string().min(1).max(100).safeParse((await props.params).id);
  if (!id.success) notFound();
  return <PersonView me={me} personId={id.data} />;
}
