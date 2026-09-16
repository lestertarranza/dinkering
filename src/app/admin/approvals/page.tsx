import Link from "next/link";
import { getAccountsReady } from "@/lib/auth";
import {
  listPendingRequests,
  recentRsvpsForPlayer,
} from "@/lib/accounts";
import {
  Badge,
  Card,
  EmptyState,
  Field,
  PageHeader,
  StatusBadge,
  inputClass,
} from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { formatPhMobile } from "@/lib/phone";
import { playerFullName } from "@/lib/account-fields";
import { approveRequest, rejectRequest } from "./actions";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; status?: string }>;
}) {
  const { kind = "", status = "pending" } = await searchParams;
  const ready = await getAccountsReady();
  const rows = ready ? await listPendingRequests() : [];
  const filtered = rows.filter((r) => {
    if (kind && r.kind !== kind) return false;
    if (status && r.status !== status) return false;
    return true;
  });

  const rsvpByRequest = new Map<string, { label: string; status: string }[]>();
  await Promise.all(
    filtered
      .filter((r) => r.kind === "claim" && r.claimed_player_id && r.status === "pending")
      .map(async (r) => {
        rsvpByRequest.set(
          r.id,
          await recentRsvpsForPlayer(r.claimed_player_id as string),
        );
      }),
  );

  return (
    <div>
      <PageHeader
        title="Approvals"
        description="New registrations create a player. Claims attach a login to someone already on the roster."
      />

      {!ready ? (
        <Card className="p-4 text-sm text-amber-900">
          Run migration <code className="font-mono">0020_player_accounts.sql</code> in
          the Supabase SQL editor to enable player logins. Until then, only
          existing Auth users can sign in, and they are treated as admins.
        </Card>
      ) : null}

      <form className="mb-4 flex flex-wrap gap-2">
        <select name="kind" defaultValue={kind} className={`${inputClass} max-w-48`}>
          <option value="">All kinds</option>
          <option value="register">New registration</option>
          <option value="claim">Claim</option>
        </select>
        <select name="status" defaultValue={status} className={`${inputClass} max-w-48`}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <SubmitButton variant="secondary">Filter</SubmitButton>
      </form>

      {filtered.length === 0 ? (
        <EmptyState
          title="Nothing in this queue"
          description="New register and claim requests show up here."
        />
      ) : (
        <div className="space-y-4">
          {filtered.map((r) => {
            const name = playerFullName(r.first_name, r.last_name);
            const rsvps = rsvpByRequest.get(r.id) ?? [];
            return (
              <Card key={r.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-slate-900">{name}</h2>
                      <Badge tone={r.kind === "claim" ? "info" : "going"}>
                        {r.kind === "claim" ? "Claim" : "New registration"}
                      </Badge>
                      <StatusBadge status={r.status} />
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {r.email} · {formatPhMobile(r.phone)}
                    </p>
                    {r.kind === "claim" ? (
                      <p className="mt-1 text-sm text-slate-600">
                        Claims{" "}
                        {r.claimed_player_id ? (
                          <Link
                            href={`/admin/players/${r.claimed_player_id}`}
                            className="font-medium text-emerald-700"
                          >
                            {r.player_name ?? "player"}
                          </Link>
                        ) : (
                          "an unknown player"
                        )}
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-slate-500">
                        Approving creates an Active player and adds them to
                        upcoming games.
                      </p>
                    )}
                    {r.note ? (
                      <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                        {r.note}
                      </p>
                    ) : null}
                    {r.reject_reason ? (
                      <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
                        {r.reject_reason}
                      </p>
                    ) : null}
                  </div>
                  {r.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.avatar_url}
                      alt=""
                      className="h-16 w-16 rounded-full object-cover"
                    />
                  ) : null}
                </div>

                {rsvps.length > 0 ? (
                  <div className="mt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Recent RSVPs
                    </p>
                    <ul className="mt-1 space-y-0.5 text-sm text-slate-600">
                      {rsvps.map((x) => (
                        <li key={x.label}>
                          {x.label}: {x.status.replace("_", " ")}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {r.status === "pending" ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <ActionForm action={approveRequest} pendingLabel="Approving…">
                      <input type="hidden" name="id" value={r.id} />
                      <SubmitButton className="w-full" pendingLabel="Approving…">
                        Approve
                      </SubmitButton>
                    </ActionForm>
                    <ActionForm action={rejectRequest} pendingLabel="Rejecting…">
                      <input type="hidden" name="id" value={r.id} />
                      <Field label="Reject reason (optional)">
                        <textarea name="reason" rows={2} className={inputClass} />
                      </Field>
                      <SubmitButton
                        variant="danger"
                        className="mt-2 w-full"
                        pendingLabel="Rejecting…"
                      >
                        Reject
                      </SubmitButton>
                    </ActionForm>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
