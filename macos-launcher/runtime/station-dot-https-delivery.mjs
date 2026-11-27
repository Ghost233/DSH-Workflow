// Private Station integration only. No ambient callback URLs, DNS resolution,
// proxies, retries, custom trust roots, or network setup on module import.
import { lookup } from 'node:dns/promises'
import { request } from 'node:https'
import { isIP } from 'node:net'
function fixedUrl(value) {
  const url=new URL(value)
  if(url.protocol!=='https:'||url.href!==value||url.username||url.password||url.hash||url.search||
     url.port||isIP(url.hostname)||!/^[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z]{2,63}$/.test(url.hostname)||
     /\.(?:localhost|local|test|invalid|example|internal|onion)$/.test(url.hostname))
    throw new Error('station_callback_not_approved')
  return url
}
// Deliberately IPv4-only. Reject non-globally routable and special-purpose
// blocks, conservatively including IANA protocol-assignment supernets.
function publicIpv4(address){
  if(isIP(address)!==4)return false
  const [a,b,c]=address.split('.').map(Number)
  return a>0&&a<224&&a!==10&&a!==127&&
    !(a===100&&b>=64&&b<=127)&&!(a===169&&b===254)&&!(a===172&&b>=16&&b<=31)&&
    !(a===192&&(b===168||(b===0&&(c===0||c===2))||b===88&&c===99))&&
    !(a===198&&((b>=18&&b<=19)||b===51&&c===100))&&!(a===203&&b===0&&c===113)
}
export function createStationHttpsDelivery({enabled,approval,budget}={}){
  if(enabled!==true)return null
  if(!approval||!publicIpv4(approval.address))throw new Error('station_callback_not_approved')
  const url=fixedUrl(approval.url)
  return buildPinnedPost({logicalUrl:url.href,hostname:url.hostname,path:url.pathname,address:approval.address,port:443,budget})
}
const officialOrigin='https://connectors.api.openai.com'
export function isOfficialStationCallback(value){
  if(typeof value!=='string'||value.length>1024)return false
  try{
    const u=fixedUrl(value)
    return u.origin===officialOrigin&&/^\/webhook\/mcp-events\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+$/.test(u.pathname)
  }catch{return false}
}
export function createOfficialStationHttpsDelivery({resolve=lookup}={}){
  return async input=>{
    if(!isOfficialStationCallback(input?.url)||input.method!=='POST'||input.redirect!=='error')
      throw Error('station_callback_not_approved')
    const url=new URL(input.url), signal=input.signal
    const abort=new Promise((_,reject)=>{
      if(signal?.aborted)reject(Error('station_callback_dns_unavailable'))
      else signal?.addEventListener('abort',()=>reject(Error('station_callback_dns_unavailable')),{once:true})
    })
    const answers=await Promise.race([resolve(url.hostname,{family:4,all:true}),abort])
    if(!Array.isArray(answers)||!answers.length||answers.length>32||
       answers.some(row=>row?.family!==4||!publicIpv4(row.address)))
      throw Error('station_callback_address_rejected')
    return buildPinnedPost({logicalUrl:url.href,hostname:url.hostname,path:url.pathname,
      address:answers[0].address,port:443,budget:10000})(input)
  }
}
// Internal transport primitive also used by the disposable TLS fixture; the
// normal adapter above alone creates production transports (no custom CA).
export function buildPinnedPost({logicalUrl,hostname,path,address,port,ca,budget=1500}){
  return async ({url,method,redirect,headers,body,signal}={})=>{
    if(url!==logicalUrl||method!=='POST'||redirect!=='error'||!headers||typeof body!=='string'||
       Buffer.byteLength(body)>8192)throw new Error('station_callback_request_rejected')
    const headerNames=['Content-Type','webhook-id','webhook-timestamp','X-MCP-Subscription-Id','webhook-signature']
    if(Object.keys(headers).length!==headerNames.length||headerNames.some(k=>typeof headers[k]!=='string'||
       headers[k].length>512||!/^[\x20-\x7e]+$/.test(headers[k]))||headers['Content-Type']!=='application/json')
      throw new Error('station_callback_request_rejected')
    const input=Buffer.from(body), timeout=AbortSignal.timeout(budget)
    const deadline=signal?AbortSignal.any([signal,timeout]):timeout
    if(deadline.aborted)throw new Error('station_callback_transport_failed')
    return new Promise((resolve,reject)=>{
      const fail=()=>reject(new Error('station_callback_transport_failed'))
      const req=request({hostname:address,port,path,method:'POST',servername:hostname,agent:false,
        rejectUnauthorized:true,minVersion:'TLSv1.2',signal:deadline,...(ca?{ca}:{}),
        headers:{...headers,Host:hostname,'Content-Length':input.length,Connection:'close'}},res=>{
        res.on('error',fail)
        const status=res.statusCode
        if(status<200||status>=300||!headers['webhook-id'].startsWith('msg_verification_')){
          // Never follow Location. Non-verification replies need no body.
          resolve({status});res.destroy();return
        }
        let size=0
        const chunks=[]
        res.on('data',chunk=>{
          size+=chunk.length
          if(size>4096){fail();res.destroy();return}
          chunks.push(chunk)
        })
        res.on('end',()=>{
          try{resolve({status,json:JSON.parse(Buffer.concat(chunks).toString('utf8'))})}catch{fail()}
        })
      })
      req.on('error',fail)
      req.end(input)
    })
  }
}
