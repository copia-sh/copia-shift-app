import type { ShiftStatus } from "../types";

export const SHARE_LINK_STATUSES: ShiftStatus[] = ["desired", "confirmed"];

/** 32 bytes of randomness, base64url-encoded (no padding) -> 43 chars. */
export function generateShareToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 購読用フィードURLを組み立てる。groupId・token は URL エンコードする。 */
export function buildShareFeedUrl(baseUrl: string, groupId: string, token: string): string {
  const trimmedBase = baseUrl.replace(/\/+$/, "");
  return `${trimmedBase}/feed/${encodeURIComponent(groupId)}/${encodeURIComponent(token)}.ics`;
}

export interface ShareLinkFilterInput {
  statuses: ReadonlySet<ShiftStatus>;
  typeKeys: ReadonlySet<string>;
}

/** リンク発行フォームが送信可能な状態かどうか。状態・種別ともに1つ以上必要。 */
export function isValidShareLinkFilter(input: ShareLinkFilterInput): boolean {
  return input.statuses.size > 0 && input.typeKeys.size > 0;
}

export interface DescribeShareLinkFilterParams {
  statuses: ShiftStatus[];
  typeKeys: string[];
  labelOf: (typeKey: string) => string;
}

const STATUS_LABEL: Record<string, string> = {
  confirmed: "確定のみ",
  desired: "希望のみ",
};

/** 既存リンク一覧に出す「このリンクの中身」の短い要約。 */
export function describeShareLinkFilter({
  statuses,
  typeKeys,
  labelOf,
}: DescribeShareLinkFilterParams): string {
  const statusLabel =
    statuses.length >= SHARE_LINK_STATUSES.length ? "希望・確定" : STATUS_LABEL[statuses[0]];
  const typeLabel = typeKeys.map(labelOf).join(", ");
  return `${statusLabel}・${typeLabel}`;
}
