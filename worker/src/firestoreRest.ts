export interface FirestoreDocument {
  id: string;
  data: Record<string, unknown>;
}

export interface FieldFilter {
  field: string;
  op: "==" | ">=" | "<=";
  value: string | number | boolean;
}

export interface FirestoreClient {
  getDocument(path: string): Promise<FirestoreDocument | null>;
  queryCollection(parentPath: string, collectionId: string, filters: FieldFilter[]): Promise<FirestoreDocument[]>;
}

type FirestoreValue =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { nullValue: null }
  | { timestampValue: string }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreValue> } };

/** Firestore REST の型付きJSON(1フィールド分)をプレーンな値に戻す。 */
export function decodeFirestoreValue(value: FirestoreValue): unknown {
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("nullValue" in value) return null;
  if ("timestampValue" in value) return new Date(value.timestampValue).getTime();
  if ("arrayValue" in value) return (value.arrayValue.values ?? []).map(decodeFirestoreValue);
  if ("mapValue" in value) return decodeFields(value.mapValue.fields ?? {});
  return null;
}

/** ドキュメントの fields オブジェクト全体をプレーンなオブジェクトへ。 */
export function decodeFields(fields: Record<string, FirestoreValue>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    result[key] = decodeFirestoreValue(value);
  }
  return result;
}

/** クエリのフィルタ値をFirestore REST の型付きJSONへ。文字列・数値・真偽値のみ対応。 */
export function encodeFirestoreValue(value: string | number | boolean): FirestoreValue {
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
}

const OP_MAP: Record<FieldFilter["op"], string> = {
  "==": "EQUAL",
  ">=": "GREATER_THAN_OR_EQUAL",
  "<=": "LESS_THAN_OR_EQUAL",
};

function toFieldFilter({ field, op, value }: FieldFilter) {
  return {
    fieldFilter: {
      field: { fieldPath: field },
      op: OP_MAP[op],
      value: encodeFirestoreValue(value),
    },
  };
}

function toStructuredWhere(filters: FieldFilter[]) {
  if (filters.length === 1) return toFieldFilter(filters[0]);
  return { compositeFilter: { op: "AND", filters: filters.map(toFieldFilter) } };
}

export interface CreateFirestoreClientOptions {
  projectId: string;
  accessToken: string;
  /** ローカル開発用。設定すると本番のFirestoreではなくエミュレータ(http)へ向ける。 */
  emulatorHost?: string;
  fetchImpl?: typeof fetch;
}

/** Firestore REST API (v1) を、サービスアカウントのアクセストークンで叩く薄いクライアント。 */
export function createFirestoreClient({
  projectId,
  accessToken,
  emulatorHost,
  fetchImpl = fetch,
}: CreateFirestoreClientOptions): FirestoreClient {
  const baseUrl = emulatorHost
    ? `http://${emulatorHost}/v1/projects/${projectId}/databases/(default)/documents`
    : `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  const authHeaders = { Authorization: `Bearer ${accessToken}` };

  async function getDocument(path: string): Promise<FirestoreDocument | null> {
    const res = await fetchImpl(`${baseUrl}/${path}`, { headers: authHeaders });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Firestore getDocument failed: ${res.status}`);
    const json = (await res.json()) as { name: string; fields?: Record<string, FirestoreValue> };
    return { id: json.name.split("/").pop() as string, data: decodeFields(json.fields ?? {}) };
  }

  async function queryCollection(
    parentPath: string,
    collectionId: string,
    filters: FieldFilter[],
  ): Promise<FirestoreDocument[]> {
    const structuredQuery = { from: [{ collectionId }], where: toStructuredWhere(filters) };
    const res = await fetchImpl(`${baseUrl}/${parentPath}:runQuery`, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ structuredQuery }),
    });
    if (!res.ok) throw new Error(`Firestore runQuery failed: ${res.status}`);
    const json = (await res.json()) as Array<{
      document?: { name: string; fields?: Record<string, FirestoreValue> };
    }>;
    return json
      .filter((entry): entry is { document: NonNullable<(typeof entry)["document"]> } => Boolean(entry.document))
      .map((entry) => ({
        id: entry.document.name.split("/").pop() as string,
        data: decodeFields(entry.document.fields ?? {}),
      }));
  }

  return { getDocument, queryCollection };
}
