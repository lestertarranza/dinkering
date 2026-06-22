import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  PageHeader,
  Badge,
  Field,
  inputClass,
  EmptyState,
} from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { formatMoney, describeBalance } from "@/lib/format";
import type { Player, PlayerGroup } from "@/lib/types";
import { createGroup } from "./actions";

export const dynamic = "force-dynamic";

const typeLabels: Record<string, string> = {
  individual: "Individual",
  couple: "Couple",
  family: "Family",
  team_fund: "Team fund",
};

export default async function GroupsPage() {
  const supabase = await createClient();
  const [{ data: groups }, { data: balances }, { data: players }] =
    await Promise.all([
      supabase.from("player_groups").select("*").order("name"),
      supabase.from("group_balances").select("*"),
      supabase
        .from("players")
        .select("id, name")
        .eq("active_status", "active")
        .order("name"),
    ]);

  const balMap = new Map(
    (balances ?? []).map((b) => [b.player_group_id as string, Number(b.balance)]),
  );

  return (
    <div>
      <PageHeader
        title="Player Groups / Pooled Funds"
        description="Couples, families, or team funds that share one wallet balance."
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="p-4 lg:order-2">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">
            Create group
          </h2>
          <form action={createGroup} className="space-y-3">
            <Field label="Group name" hint="e.g. “Pachie &amp; Carl”">
              <input name="name" required className={inputClass} />
            </Field>
            <Field label="Type">
              <select name="type" className={inputClass} defaultValue="couple">
                <option value="couple">Couple</option>
                <option value="family">Family</option>
                <option value="team_fund">Team fund</option>
                <option value="individual">Individual</option>
              </select>
            </Field>
            <Field label="Members" hint="Hold Ctrl/Cmd to select several">
              <select
                name="member_ids"
                multiple
                size={5}
                className={inputClass}
              >
                {((players ?? []) as Pick<Player, "id" | "name">[]).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Notes">
              <textarea name="notes" rows={2} className={inputClass} />
            </Field>
            <SubmitButton className="w-full">Create group</SubmitButton>
          </form>
        </Card>

        <div className="lg:order-1 lg:col-span-2">
          {(groups ?? []).length === 0 ? (
            <EmptyState
              title="No groups yet"
              description="Create a pooled fund for couples or families."
            />
          ) : (
            <div className="space-y-2">
              {((groups ?? []) as PlayerGroup[]).map((g) => {
                const d = describeBalance(balMap.get(g.id) ?? 0);
                return (
                  <Link
                    key={g.id}
                    href={`/admin/groups/${g.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-300"
                  >
                    <div>
                      <p className="font-medium text-slate-900">{g.name}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {typeLabels[g.type] ?? g.type}
                      </p>
                    </div>
                    <div className="text-right">
                      <Badge tone={d.tone}>{d.label}</Badge>
                      <p
                        className={`mt-1 text-sm font-semibold ${
                          d.tone === "collect"
                            ? "text-rose-600"
                            : d.tone === "credit"
                              ? "text-emerald-600"
                              : "text-slate-400"
                        }`}
                      >
                        {d.tone === "settled" ? "—" : formatMoney(d.amount)}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
