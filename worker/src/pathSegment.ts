/**
 * groupId・token として使ってよい文字だけを許可する。
 *
 * URLの `%2F` は `decodeURIComponent` で `/` に戻るため、ルーティングの正規表現
 * (`[^/]+`)だけでは防げない。デコード後の文字列をFirestoreのドキュメントパスに
 * そのまま埋め込む前に、ここで英数字・`-`・`_` 以外(`/`・`..`・`%` など)を拒否する。
 * これが漏れると、パス結合後の文字列をfetchに渡した際にURL側の dot-segment 正規化で
 * 意図しないドキュメント(例: `shareLinks/x/../../members/M1` -> `members/M1`)に化ける。
 */
const VALID_PATH_SEGMENT = /^[A-Za-z0-9_-]{1,128}$/;

export function isValidPathSegment(value: string): boolean {
  return VALID_PATH_SEGMENT.test(value);
}
