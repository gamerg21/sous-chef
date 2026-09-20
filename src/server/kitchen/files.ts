import type { DatabaseSync } from 'node:sqlite';
/** A local file is readable by its uploader or members of an explicitly linked kitchen. */
export function readAuthorizedFile(sql:DatabaseSync,id:string,userId:string|null):{mime:string;bytes:Uint8Array}|null {
 if(!userId)return null;
 const file=sql.prepare('SELECT user_id,mime,bytes FROM files WHERE id=?').get(id);if(!file)return null;
 if(file.user_id!==userId){
  const url=`/api/files/${id}`;
  const recipe=sql.prepare(`SELECT 1 FROM mediaAssets a JOIN recipes r ON r.id=json_extract(a.data,'$.recipeId') JOIN householdMembers m ON json_extract(m.data,'$.householdId')=json_extract(r.data,'$.householdId') WHERE json_extract(a.data,'$.url')=? AND json_extract(m.data,'$.userId')=? LIMIT 1`).get(url,userId);
  const inventory=recipe||sql.prepare(`SELECT 1 FROM mediaAssets a JOIN inventoryItems i ON i.id=json_extract(a.data,'$.inventoryItemId') JOIN householdMembers m ON json_extract(m.data,'$.householdId')=json_extract(i.data,'$.householdId') WHERE json_extract(a.data,'$.url')=? AND json_extract(m.data,'$.userId')=? LIMIT 1`).get(url,userId);
  if(!inventory)return null;
 }
 return {mime:String(file.mime),bytes:file.bytes as Uint8Array};
}
