export class ApiError extends Error { constructor(public status:number,public code:string,message:string){super(message);} }
export async function api<T>(path:string,options:RequestInit={},timeoutMs=10000):Promise<T>{
 const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),timeoutMs);
 try {const res=await fetch(path,{...options,credentials:'same-origin',signal:controller.signal,headers:{Accept:'application/json',...options.headers}});
 if(!res.ok){const body=await res.json().catch(()=>({}));throw new ApiError(res.status,body.code??'REQUEST_FAILED',body.message??'Request failed');}
 return await res.json() as T;
 } finally {clearTimeout(timer);}
}
