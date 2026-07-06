import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import mongoose from "mongoose";
import app from "../app";
import env from "../config/env";
import User from "../models/User";
import Category from "../models/Category";
import Business from "../models/Business";
import {createBusiness,listBusinesses} from "../services/business.service";
async function main(){
 const database="audience_test_"+randomUUID().replaceAll("-","").slice(0,16);
 await mongoose.connect(env.MONGO_URI,{dbName:database});
 const server=app.listen(0,"127.0.0.1");await new Promise<void>(resolve=>server.once("listening",resolve));
 try{
  const owner=await User.create({firebaseUid:"audience-owner",fullName:"Owner",email:"owner@example.test",roles:["owner"]});
  const category=await Category.create({name:"Audience fixtures",isActive:true});
  const base={ownerId:owner._id,name:"Everyone",longitude:38,latitude:9,type:"shop" as const,businessCategoryId:String(category._id),addressString:"Test address"};
  const everyone=await createBusiness({...base,genderTarget:"all"});
  assert.equal(everyone.genderTarget,"all","Creation must retain the submitted audience");
  await createBusiness({...base,name:"Men",genderTarget:"male"});
  await createBusiness({...base,name:"Women",genderTarget:"female"});
  const unknown=await createBusiness({...base,name:"Unclassified"});
  assert.equal(unknown.genderTarget,"unknown","Missing audience must not silently become male");
  const names=(rows:Array<Record<string,unknown>>)=>rows.map(row=>String(row.name)).sort();
  assert.deepEqual(names(await listBusinesses({gender:"male"})),["Everyone","Men"]);
  assert.deepEqual(names(await listBusinesses({gender:"female"})),["Everyone","Women"]);
  assert.deepEqual(names(await listBusinesses({gender:"all"})),["Everyone"]);
  assert.deepEqual(names(await listBusinesses()),["Everyone","Men","Unclassified","Women"]);
  const port=(server.address() as {port:number}).port;
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/v1/businesses?gender=all`)).status,200);
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/v1/businesses?gender=invalid`)).status,400);
  assert.equal(await Business.countDocuments(),4);
  console.log("PASS: explicit audience persists, unknown stays unclassified, Everyone matches both audiences, public query validation");
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));try{if(mongoose.connection.name===database && database.startsWith("audience_test_")) await mongoose.connection.dropDatabase();}finally{await mongoose.disconnect();}}
}
main().catch(error=>{console.error(error.name,String(error.message).replace(/mongodb[^ ]+/g,"[database]"));process.exitCode=1});
