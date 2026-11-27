// One Station owner, one callback lease, no network or ambient config. Darwin
// releases O_EXLOCK on process exit; never unlink the lock inode.
import { constants,openSync,closeSync,fstatSync,readFileSync,writeFileSync,fsyncSync,
  renameSync,unlinkSync,realpathSync,lstatSync } from 'node:fs'
import { join,isAbsolute } from 'node:path'
import { createCipheriv,createDecipheriv,createHmac,randomBytes,randomUUID } from 'node:crypto'
const O_EXLOCK=0x20
const {O_RDWR,O_RDONLY,O_CREAT,O_NOFOLLOW,O_NONBLOCK,O_EXCL,O_WRONLY}=constants
const privateFile=st=>st.uid===process.getuid()&&st.nlink===1&&st.isFile()&&(st.mode&0o777)===0o600
const unavailable=()=>new Error('station_subscription_store_unavailable')
export function openStationSubscriptionStore({directory,key,binding,purpose='subscription'}){
  if(!['subscription','prompt-receipts'].includes(purpose))throw unavailable()
  if(process.platform!=='darwin'||typeof directory!=='string'||!isAbsolute(directory)||
     !Buffer.isBuffer(key)||key.length!==32||!Array.isArray(binding)||realpathSync(directory)!==directory)throw unavailable()
  const st=lstatSync(directory)
  if(!st.isDirectory()||st.uid!==process.getuid()||(st.mode&0o777)!==0o700)throw unavailable()
  const fd=openSync(join(directory,purpose+'.lock'),O_RDWR|O_CREAT|O_NOFOLLOW|O_NONBLOCK|O_EXLOCK,0o600)
  const maxBytes=purpose==='subscription'?2048:32768
  const dest=join(directory,purpose+'.v1'),aad=Buffer.from(JSON.stringify(['station-'+purpose+'-v1',binding]))
  const secret=createHmac('sha256',key).update('station-'+purpose+'-aes-256-gcm-v1').digest()
  let closed=false,row=null
  try{
    if(!privateFile(fstatSync(fd)))throw unavailable()
    let input
    try{input=openSync(dest,O_RDONLY|O_NOFOLLOW|O_NONBLOCK)}catch(e){if(e.code!=='ENOENT')throw e}
    if(input!==undefined){
      try{
        const info=fstatSync(input)
        if(!privateFile(info)||info.size<30||info.size>maxBytes)throw unavailable()
        const bytes=readFileSync(input)
        const dec=createDecipheriv('aes-256-gcm',secret,bytes.subarray(0,12))
        dec.setAAD(aad);dec.setAuthTag(bytes.subarray(12,28))
        row=JSON.parse(Buffer.concat([dec.update(bytes.subarray(28)),dec.final()]).toString('utf8'))
      }finally{closeSync(input)}
    }
  }catch{closeSync(fd);secret.fill(0);throw unavailable()}
  return Object.freeze({
    read(){if(closed)throw unavailable();return structuredClone(row)},
    write(value){
      if(closed)throw unavailable()
      const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',secret,iv)
      cipher.setAAD(aad)
      const ciphertext=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()])
      if(ciphertext.length+28>maxBytes)throw unavailable()
      const temp=join(directory,'.station-'+purpose+'-'+randomUUID())
      const out=openSync(temp,O_WRONLY|O_CREAT|O_EXCL|O_NOFOLLOW,0o600)
      try{
        try{writeFileSync(out,Buffer.concat([iv,cipher.getAuthTag(),ciphertext]));fsyncSync(out)}
        finally{closeSync(out)}
        renameSync(temp,dest)
        const dir=openSync(directory,O_RDONLY|O_NOFOLLOW)
        try{fsyncSync(dir)}finally{closeSync(dir)}
        row=structuredClone(value)
      }finally{try{unlinkSync(temp)}catch(e){if(e.code!=='ENOENT')throw e}}
    },
    close(){if(!closed){closed=true;row=null;secret.fill(0);closeSync(fd)}}
  })
}
