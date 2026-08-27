"use client";
import {useEffect,useState} from "react";

export type ApplicationFields={
  type:string;
  name:string;
  phoneNumber:string;
  addressString:string;
  businessCategoryId:string;
  genderTarget:string;
  latitude:string;
  longitude:string;
  bufferRange:string;
  travelRate:string;
  minTravelFee:string;
  idNumber:string;
  smsRequested:boolean;
};

export const emptyApplication:ApplicationFields={
  type:"shop",
  name:"",
  phoneNumber:"",
  addressString:"",
  businessCategoryId:"",
  genderTarget:"",
  latitude:"",
  longitude:"",
  bufferRange:"7",
  travelRate:"200",
  minTravelFee:"100",
  idNumber:"",
  smsRequested:false,
};

export function applicationPayload(fields:ApplicationFields){
  return {
    ...fields,
    latitude:Number(fields.latitude),
    longitude:Number(fields.longitude),
    bufferRange:Number(fields.bufferRange),
    travelRate:Number(fields.travelRate),
    minTravelFee:Number(fields.minTravelFee),
  };
}

const audienceOptions:[string,string][]=[
  ["male","Men"],
  ["female","Women"],
  ["all","Everyone"],
];

export default function ApplicationForm({value,onChange}:{value:ApplicationFields;onChange:(value:ApplicationFields)=>void}) {
  const [categories,setCategories]=useState<{_id:string;name:string}[]>([]);
  const [failed,setFailed]=useState(false);
  useEffect(()=>{
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/categories`)
      .then(r=>{if(!r.ok)throw Error();return r.json();})
      .then(p=>setCategories(p.data??p))
      .catch(()=>setFailed(true));
  },[]);

  const field=(key:keyof ApplicationFields,label:string,type="text",required=true)=>(
    <label className="block text-sm font-medium text-slate-700" key={key}>
      {label}
      <input
        className="mt-1 w-full rounded-lg border border-slate-300 p-3 font-normal"
        type={type}
        step={type==="number"?"any":undefined}
        required={required}
        maxLength={type==="text"?500:undefined}
        value={String(value[key])}
        onChange={e=>onChange({...value,[key]:e.target.value})}
        {...(key==="latitude"?{min:-90,max:90}:key==="longitude"?{min:-180,max:180}:type==="number"?{min:0}:{})}
      />
    </label>
  );

  const audienceSelected=["male","female","all"].includes(value.genderTarget);

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="mb-2 text-sm font-medium">How do you work?</legend>
        <div className="grid grid-cols-2 gap-3">
          {[["shop","Shop"],["independent","Independent professional"]].map(([type,label])=>(
            <label key={type} className={`cursor-pointer rounded-xl border p-4 ${value.type===type?"border-teal-600 bg-teal-50":"border-slate-200"}`}>
              <input type="radio" name="businessType" checked={value.type===type} onChange={()=>onChange({...value,type})}/> <span className="text-sm">{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {field("name",value.type==="independent"?"Professional / business name":"Shop name")}

      <label className="block text-sm font-medium">
        Business category
        <select
          required
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-3"
          value={value.businessCategoryId}
          onChange={e=>onChange({...value,businessCategoryId:e.target.value})}
        >
          <option value="">Choose a category</option>
          {categories.map(c=><option key={c._id} value={c._id}>{c.name}</option>)}
        </select>
      </label>
      {failed&&<p className="text-sm text-red-600">Could not load categories. Refresh to try again.</p>}

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Who do you serve?</legend>
        <p className="mb-3 text-xs text-slate-500">
          Choose the customers this business serves. This is not the owner&apos;s gender.
        </p>
        <div className="grid grid-cols-3 gap-3">
          {audienceOptions.map(([id,label])=>(
            <label
              key={id}
              className={`cursor-pointer rounded-xl border p-3 text-center text-sm ${
                value.genderTarget===id?"border-teal-600 bg-teal-50 font-semibold":"border-slate-200"
              }`}
            >
              <input
                type="radio"
                name="genderTarget"
                className="sr-only"
                checked={value.genderTarget===id}
                onChange={()=>onChange({...value,genderTarget:id})}
                required
              />
              {label}
            </label>
          ))}
        </div>
        {!audienceSelected && (
          <p className="mt-2 text-sm text-amber-700">Choose Men, Women, or Everyone to continue.</p>
        )}
      </fieldset>

      {field("phoneNumber","Contact phone","tel")}
      {field("addressString",value.type==="independent"?"Base address / service area":"Shop address")}
      <p className="text-xs text-slate-500">Enter your shop or service base coordinates from your map location.</p>
      <div className="grid grid-cols-2 gap-3">
        {field("latitude","Latitude","number")}
        {field("longitude","Longitude","number")}
      </div>

      {value.type==="independent"&&(
        <fieldset className="space-y-4 rounded-xl bg-slate-50 p-4">
          <legend className="text-sm font-semibold">Independent professional details</legend>
          {field("bufferRange","Service radius (km)","number")}
          {field("travelRate","Travel rate per km (ETB)","number")}
          {field("minTravelFee","Minimum travel fee (ETB)","number")}
          {field("idNumber","ID number","text")}
          <p className="text-xs text-slate-500">Upload your ID image on the next page. It is private and available only to you and authorized reviewers.</p>
        </fieldset>
      )}

      <label className="flex gap-2 text-sm">
        <input
          type="checkbox"
          checked={value.smsRequested}
          onChange={e=>onChange({...value,smsRequested:e.target.checked})}
        />
        Request SMS service for this business (subject to activation)
      </label>
    </div>
  );
}
