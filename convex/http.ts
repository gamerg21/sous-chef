import { httpRouter } from "convex/server";
import { browse, write } from "./hubHttp";
import { appleSession, deleteAccount, updateName } from "./appleHttp";
import { auth } from "./auth";

const http = httpRouter();

auth.addHttpRoutes(http);

http.route({path:"/api/v1/recipes",method:"GET",handler:browse});
http.route({pathPrefix:"/api/v1/recipes/",method:"GET",handler:browse});
for (const path of ["/api/v1/me","/api/v1/publish","/api/v1/unpublish"]) http.route({path,method:"POST",handler:write});
http.route({path:"/api/v1/apple/session",method:"POST",handler:appleSession});
http.route({path:"/api/v1/account/delete",method:"POST",handler:deleteAccount});
http.route({path:"/api/v1/me/name",method:"POST",handler:updateName});
export default http;
