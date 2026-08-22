"use client";
import {useEffect,useState} from "react";
import {useSession} from "next-auth/react";
import {usePathname,useRouter} from "next/navigation";
import api from "@/lib/axios";
export default function OwnerGate({children}:{children:React.ReactNode}) {
 const {status}=useSession();const path=usePathname();const router=useRouter();const [allowed,setAllowed]=useState(false);const [failed,setFailed]=useState(false);
 const publicPath=path.startsWith("/auth/") || path==="/application" || ["/privacy","/account-deletion","/reset-password"].includes(path);
 useEffect(()=>{
  let active=true;setAllowed(false);setFailed(false);
  if(publicPath || status==="loading")return;
  if(status!=="authenticated"){router.replace("/auth/signin");return;}
  api.get("/auth/workspaces").then(response=>{if(!active)return;if(response.data.data?.workspaces?.some((w: {role: string}) => ['owner','independent'].includes(w.role)))setAllowed(true);else router.replace("/application");}).catch(error=>{if(!active)return;if(error?.response?.status===401){router.replace("/auth/signin");return;}setFailed(true);});
  return()=>{active=false};
 },[publicPath,status,router]);
 if(publicPath)return children;
 if(!allowed)return <div className="flex min-h-screen items-center justify-center text-slate-600">{failed?<div>Could not check workspace access. <button onClick={()=>window.location.reload()} className="underline">Retry</button></div>:"Checking your workspace…"}</div>;
 return children;
}
