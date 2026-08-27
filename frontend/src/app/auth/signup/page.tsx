"use client";
import {useState} from "react";
import Link from "next/link";
import {createUserWithEmailAndPassword,getIdToken,sendEmailVerification,updateProfile} from "firebase/auth";
import {signIn,useSession} from "next-auth/react";
import {auth} from "@/lib/firebase";
import ApplicationForm,{emptyApplication,applicationPayload} from "@/components/onboarding/ApplicationForm";
export default function SignUpPage(){
 const {status}=useSession();const [fields,setFields]=useState(emptyApplication);const [fullName,setFullName]=useState("");const [email,setEmail]=useState("");const [password,setPassword]=useState("");const [busy,setBusy]=useState(false);const [error,setError]=useState("");
 async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError("");try{
  const user=auth.currentUser?.email===email?auth.currentUser:(await createUserWithEmailAndPassword(auth,email,password)).user;
  await updateProfile(user,{displayName:fullName});const idToken=await getIdToken(user,true);
  const request=async(path:string,body:unknown,method="POST")=>{const response=await fetch(`${process.env.NEXT_PUBLIC_API_URL}/onboarding/${path}`,{method,headers:{"Content-Type":"application/json",Authorization:`Bearer ${idToken}`},body:JSON.stringify(body)});const result=await response.json();if(!response.ok)throw Error(result.message||"Could not save your application");return result;};
  await request("register",{fullName});await request("mine",applicationPayload(fields),"PUT");
  // Email delivery can be retried from the status page without recreating the account.
  await sendEmailVerification(user).catch(()=>undefined);
  const result=await signIn("credentials",{idToken,redirect:false});if(result?.error)throw Error("Account saved. Please sign in to continue.");window.location.assign("/application");
 }catch(error){setError(error instanceof Error?error.message:"Registration failed");}finally{setBusy(false);}}
 if(status==="authenticated")return <main className="mx-auto max-w-lg p-10"><h1 className="text-2xl font-semibold">You are already signed in</h1><p className="my-4">Continue your application using this account, or sign out of the business portal to register another account.</p><Link className="text-teal-700 underline" href="/application">Continue to your application</Link></main>;
 return <main className="min-h-screen bg-slate-50 px-4 py-12"><div className="mx-auto max-w-xl rounded-2xl border bg-white p-7 shadow-sm"><p className="text-xs font-semibold uppercase tracking-widest text-teal-700">Join Elvezet</p><h1 className="mt-2 text-2xl font-semibold">Register your business</h1><p className="mt-2 text-sm text-slate-600">For shops and independent professionals. Verify your email and submit your details for administrator approval.</p>{error&&<p role="alert" className="my-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}<form onSubmit={submit} className="mt-6 space-y-5"><fieldset className="space-y-4"><legend className="mb-3 font-semibold">Your account</legend>{[["Full name",fullName,setFullName,"text"],["Email",email,setEmail,"email"],["Password",password,setPassword,"password"]].map(([label,value,setter,type])=><label className="block text-sm font-medium" key={String(label)}>{String(label)}<input required minLength={type==="password"?8:2} maxLength={120} autoComplete={type==="password"?"new-password":undefined} className="mt-1 w-full rounded-lg border p-3" type={String(type)} value={String(value)} onChange={e=>(setter as (s:string)=>void)(e.target.value)}/></label>)}</fieldset><ApplicationForm value={fields} onChange={setFields}/><button disabled={busy} className="w-full rounded-lg bg-teal-700 p-3 font-semibold text-white disabled:opacity-50">{busy?"Saving…":"Create account and save application"}</button></form><p className="mt-5 text-sm">Already registered? <Link href="/auth/signin" className="text-teal-700 underline">Business sign in</Link></p></div></main>;
}
