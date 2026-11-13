import { httpRouter } from "convex/server";
import { browse, write } from "./hubHttp";
import { appleSession, deleteAccount, updateName } from "./appleHttp";
import { read as readV2, write as writeV2 } from "./communityHttp";
import { auth } from "./auth";

const http = httpRouter();

auth.addHttpRoutes(http);

http.route({path:"/api/v1/recipes",method:"GET",handler:browse});
http.route({pathPrefix:"/api/v1/recipes/",method:"GET",handler:browse});
for (const path of ["/api/v1/me","/api/v1/publish","/api/v1/unpublish"]) http.route({path,method:"POST",handler:write});
http.route({path:"/api/v1/apple/session",method:"POST",handler:appleSession});
http.route({path:"/api/v1/account/delete",method:"POST",handler:deleteAccount});
http.route({path:"/api/v1/me/name",method:"POST",handler:updateName});

// API v2 (docs/COMMUNITY_API.md)
for (const path of ["/api/v2/recipes","/api/v2/revisions","/api/v2/tags"]) http.route({path,method:"GET",handler:readV2});
for (const pathPrefix of ["/api/v2/recipes/","/api/v2/cooks/"]) http.route({pathPrefix,method:"GET",handler:readV2});
for (const path of ["save","report","me","me/profile","me/recipes","like","made","made/delete","follow","feed/following","mod/reports","mod/resolve"]) http.route({path:`/api/v2/${path}`,method:"POST",handler:writeV2});
export default http;
