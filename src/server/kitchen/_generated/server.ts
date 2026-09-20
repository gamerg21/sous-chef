// Local endpoint definitions. The schema/validator library supplies types only;
// execution, authentication and persistence are owned by the SQLite server.
import type { GenericDatabaseWriter } from 'convex/server';
import type { PropertyValidators, ObjectType } from 'convex/values';
import type { DataModel, Id } from './dataModel';
export type Kind = 'query' | 'mutation' | 'action';
export type Visibility = 'public' | 'internal';
export interface Endpoint<A = any, R = any, V extends Visibility = Visibility> {
  kind: Kind; visibility: V; args: PropertyValidators;
  handler: (ctx: MutationCtx, args: A) => Promise<R> | R;
}
export interface MutationCtx {
  db: GenericDatabaseWriter<DataModel>;
  userId: Id<'users'> | null;
  auth: { getUserIdentity(): Promise<{ subject: string; tokenIdentifier: string } | null> };
  files: { read(id:string): {mime:string;bytes:Uint8Array}|null; store(mime:string,bytes:Uint8Array): string };
  storage: { generateUploadUrl(): Promise<string>; getUrl(id: Id<'_storage'>): Promise<string | null> };
  runQuery<A, R>(ref: Ref<A, R>, args: A): Promise<R>;
  runMutation<A, R>(ref: Ref<A, R>, args: A): Promise<R>;
  runAction<A, R>(ref: Ref<A, R>, args: A): Promise<R>;
}
export type QueryCtx = MutationCtx;
export type ActionCtx = MutationCtx;
export interface Ref<A = any, R = any> { path: string; _args?: A; _result?: R }
function define<V extends Visibility>(kind: Kind, visibility: V) {
  return <A extends PropertyValidators, R>(definition: { args: A; handler: (ctx: MutationCtx, args: ObjectType<A>) => Promise<R> | R }): Endpoint<ObjectType<A>, R, V> => ({ ...definition, kind, visibility });
}
export const query = define('query', 'public');
export const mutation = define('mutation', 'public');
export const action = define('action', 'public');
export const internalQuery = define('query', 'internal');
export const internalMutation = define('mutation', 'internal');
export const internalAction = define('action', 'internal');
