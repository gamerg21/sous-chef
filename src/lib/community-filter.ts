// A small whole-word profanity and slur filter shared by the community
// service, the web app and (as a port) the iOS app's ContentFilter.
// ROT13-encoded so the source stays readable.
const ENCODED='shpx shpxrq shpxre shpxvat zbgureshpxre fuvg fuvggl ohyyfuvg phag ovgpu nffubyr onfgneq juber fyhg avttre avttn snttbg snt xvxr fcvp puvax genaal';
const rot13=(text:string)=>text.replace(/[a-z]/g,c=>String.fromCharCode((c.charCodeAt(0)-97+13)%26+97));
export const FILTER_TERMS:ReadonlySet<string>=new Set(ENCODED.split(' ').map(rot13));
export const FILTER_MESSAGE="This text isn't allowed in the community";
/** True when any whole word (or its plain plural) is a filtered term. */
export function isObjectionable(...texts:(string|undefined|null)[]):boolean {
  const words=texts.filter(Boolean).join('\n').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().split(/[^\p{L}\p{N}]+/u);
  return words.some(word=>FILTER_TERMS.has(word) || (word.length>3 && word.endsWith('s') && FILTER_TERMS.has(word.slice(0,-1))));
}
/** Every text field of a recipe snapshot, for filtering. */
export function snapshotTexts(snapshot:{title:string;description?:string;tags?:string[];ingredients:{name:string;note?:string}[];steps:{text:string}[]}):string[] {
  return [snapshot.title,snapshot.description||'',...(snapshot.tags||[]),...snapshot.ingredients.flatMap(i=>[i.name,i.note||'']),...snapshot.steps.map(s=>s.text)];
}
