"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IconChevronLeft, IconCopy, IconTrash } from "@/components/icons";
import { useToast } from "@/components/toast";
import { Button, Card, Empty, PageHeader, Select, Spinner } from "@/components/ui";

type Invite = { code: string; created_at: string; expires_at: string | null; used_at: string | null };

export function AdminView() {
  const router = useRouter();
  const toast = useToast();
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [days, setDays] = useState("14");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/invites")
      .then(async (res) => {
        if (res.status === 403) setForbidden(true);
        else setInvites((await res.json()).invites ?? []);
      })
      .catch(() => setInvites([]));
  }, []);

  async function create() {
    setBusy(true);
    const res = await fetch("/api/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days: Number(days) }),
    });
    setBusy(false);
    if (!res.ok) return toast("Could not create invite");
    const { invite } = (await res.json()) as { invite: Invite };
    setInvites((all) => [invite, ...(all ?? [])]);
    copy(invite.code);
  }

  function copy(code: string) {
    const link = `${location.origin}/signup?code=${code}`;
    navigator.clipboard?.writeText(link).then(
      () => toast("Invite link copied"),
      () => toast(link),
    );
  }

  const status = (i: Invite) =>
    i.used_at
      ? `Used ${new Date(i.used_at).toLocaleDateString("en-AU")}`
      : i.expires_at && new Date(i.expires_at) < new Date()
        ? "Expired"
        : `Expires ${new Date(i.expires_at!).toLocaleDateString("en-AU")}`;

  return (
    <>
      <PageHeader
        left={
          <button onClick={() => router.back()} className="-ml-2 rounded-full p-2" aria-label="Back">
            <IconChevronLeft />
          </button>
        }
        title="Invite codes"
      />
      <div className="space-y-4 px-4">
        {forbidden ? (
          <Empty>Only admins can manage invites.</Empty>
        ) : (
          <>
            <Card className="flex items-end gap-2 p-4">
              <Select
                className="flex-1"
                label="Valid for"
                value={days}
                onChange={setDays}
                options={[
                  { value: "1", label: "1 day" },
                  { value: "7", label: "7 days" },
                  { value: "14", label: "14 days" },
                  { value: "30", label: "30 days" },
                ]}
              />
              <Button onClick={create} disabled={busy}>
                New invite
              </Button>
            </Card>
            <p className="text-muted px-1 text-xs">Each code works once. Who redeemed a code isn&apos;t shown — accounts stay private.</p>
            <Card>
              {invites === null ? (
                <div className="text-muted flex justify-center py-8">
                  <Spinner />
                </div>
              ) : invites.length === 0 ? (
                <Empty>No invites yet.</Empty>
              ) : (
                <ul className="divide-border divide-y">
                  {invites.map((i) => (
                    <li key={i.code} className="flex items-center gap-2 px-4 py-2">
                      <div className="flex-1">
                        <div className="tabular font-mono">{i.code}</div>
                        <div className="text-muted text-xs">{status(i)}</div>
                      </div>
                      {!i.used_at && (
                        <>
                          <button onClick={() => copy(i.code)} className="text-accent rounded-full p-2" aria-label="Copy invite link">
                            <IconCopy width={18} height={18} />
                          </button>
                          <button
                            onClick={async () => {
                              await fetch(`/api/invites?code=${encodeURIComponent(i.code)}`, { method: "DELETE" });
                              setInvites((all) => all?.filter((x) => x.code !== i.code) ?? null);
                            }}
                            className="text-muted rounded-full p-2"
                            aria-label="Revoke invite"
                          >
                            <IconTrash width={18} height={18} />
                          </button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}
      </div>
    </>
  );
}
