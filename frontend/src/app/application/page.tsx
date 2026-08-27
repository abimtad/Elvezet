"use client";
import {useEffect,useState} from "react";
import {useSession,signIn} from "next-auth/react";
import {onAuthStateChanged,getIdToken,sendEmailVerification} from "firebase/auth";
import {auth} from "@/lib/firebase";
import api from "@/lib/axios";
import {authService} from "@/services/auth.service";
import ApplicationForm,{emptyApplication,applicationPayload,ApplicationFields} from "@/components/onboarding/ApplicationForm";
import Link from "next/link";
type Application=ApplicationFields & {_id:string;status:string;reviewNote?:string;idCardUrl?:string};
export default function ApplicationPage(){
 const {status}=useSession();const [application,setApplication]=useState<Application|null>(null);const [fields,setFields]=useState(emptyApplication);const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");const [file,setFile]=useState<File|null>(null);
 async function load(){setLoading(true);try{const [a,b]=await Promise.all([api.get("/onboarding/mine"),api.get("/onboarding/businesses")]);if(b.data.data.length && !a.data.data){window.location.replace("/");return;}setApplication(a.data.data);if(a.data.data)setFields({...emptyApplication,...a.data.data});}catch(error:unknown){const err=error as {response?:{status?:number}};if(err.response?.status===401){window.location.replace("/auth/signin");return;}setMessage("Could not load your application. Please retry.");}finally{setLoading(false);}}
 useEffect(()=>{if(status==="authenticated")void load();else if(status==="unauthenticated")window.location.replace("/auth/signin");},[status]);
 const editable=!application || ["draft","changes_requested","rejected"].includes(application.status);
 async function save(e:React.FormEvent,submit=false){e.preventDefault();setBusy(true);setMessage("");try{
  if(submit && !["male","female","all"].includes(fields.genderTarget)){setMessage("Choose who you serve: Men, Women, or Everyone.");setBusy(false);return;}
  const saved=await api.put("/onboarding/mine",{...applicationPayload(fields),submit:false});setApplication(saved.data.data);
  if(file){const form=new FormData();form.append("image",file);await api.post("/onboarding/mine/id-image",form,{headers:{"Content-Type":"multipart/form-data"}});setFile(null);}
  if(submit){await api.put("/onboarding/mine",{...applicationPayload(fields),submit:true});setMessage("Application submitted for approval.");}else setMessage("Draft saved.");await load();
 }catch(err:unknown){const error=err as {response?:{data?:{message?:string}}};setMessage(error.response?.data?.message||"Could not save. Try again.");}finally{setBusy(false);}}
 async function verify(resend=false){setBusy(true);try{
  const user=await new Promise<import("firebase/auth").User|null>(resolve=>{const unsubscribe=onAuthStateChanged(auth,value=>{unsubscribe();resolve(value);});});
  if(!user)throw Error("Sign out of the business portal and sign in again to refresh your verification.");
  if(resend){await sendEmailVerification(user);setMessage("Verification email sent. Check your inbox and spam folder.");}
  else{await user.reload();if(!user.emailVerified)throw Error("Your email is not verified yet. Open the link in your email first.");const result=await signIn("credentials",{idToken:await getIdToken(user,true),redirect:false});if(result?.error)throw Error("Please sign in again.");setMessage("Email verified. You can now submit your application.");}
 }catch(error){setMessage(error instanceof Error?error.message:"Could not verify email");}finally{setBusy(false);}}
 if(loading)return <main className="p-10">{message?<><p>{message}</p><button onClick={()=>void load()}>Retry</button></>:"Loading your application…"}</main>;
 return <main className="min-h-screen bg-slate-50 px-4 py-10"><div className="mx-auto max-w-xl rounded-2xl border bg-white p-7"><div className="flex items-center justify-between"><h1 className="text-2xl font-semibold">Your business application</h1><button onClick={()=>void authService.signOut()} className="text-sm underline">Sign out</button></div><p className="mt-3 rounded-lg bg-teal-50 p-3 text-sm font-medium text-teal-900">Status: {application?.status.replaceAll("_"," ")||"Not submitted"}</p>{application?.reviewNote&&<p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm">Administrator feedback: {application.reviewNote}</p>}{message&&<p role="status" className="my-4 text-sm text-teal-800">{message}</p>}
 {application?.status==="approved"?<><p className="my-5">Your {application.type==="independent"?"independent workspace":"shop"} is approved and ready.</p><Link href="/" className="inline-block rounded-lg bg-teal-700 p-3 text-white">Open business dashboard</Link></>:application?.status==="pending"?<><p className="my-5">Your application is waiting for administrator review. Your business will become available after approval.</p><button className="underline" onClick={()=>void load()}>Refresh status</button></>:<><div className="my-5 rounded-xl bg-slate-50 p-4 text-sm"><p>Before submitting, verify your email using the link we sent you.</p><div className="mt-3 flex flex-wrap gap-4"><button disabled={busy} className="text-teal-700 underline" onClick={()=>void verify(true)}>Resend verification email</button><button disabled={busy} className="text-teal-700 underline" onClick={()=>void verify()}>I verified my email</button></div></div>{editable&&<form onSubmit={e=>void save(e,true)} className="space-y-5"><ApplicationForm value={fields} onChange={setFields}/>{fields.type==="independent"&&<label className="block text-sm font-medium">Private ID image (JPG, PNG or WebP, up to 5 MB)<input className="mt-2 block w-full" type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setFile(e.target.files?.[0]||null)}/>{application?.idCardUrl&&<span className="mt-2 block text-teal-700">ID image uploaded. Choose another file to replace it.</span>}</label>}<div className="flex gap-3"><button disabled={busy} className="rounded-lg border px-4 py-3 disabled:opacity-50" type="button" onClick={e=>void save(e)}>Save draft</button><button disabled={busy} className="flex-1 rounded-lg bg-teal-700 px-4 py-3 text-white disabled:opacity-50">{busy?"Saving…":"Submit for approval"}</button></div></form>}</>}
 </div></main>;
}
