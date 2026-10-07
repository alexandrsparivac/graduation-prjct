import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

test('voice APIs authenticate, stream neural MP3, transcribe MP4/WebM, and surface provider failures', { timeout: 10000 }, async t => {
  const temp = await mkdtemp(join(tmpdir(), 'ld-voice-api-'));
  const preload = join(temp, 'mock.mjs');
  const providerModule = new URL('../node_modules/msedge-tts/dist/index.js', import.meta.url).href;
  await writeFile(preload, `
    import {Readable} from 'node:stream';
    import {MsEdgeTTS} from ${JSON.stringify(providerModule)};
    MsEdgeTTS.prototype.setMetadata = async function() {};
    MsEdgeTTS.prototype.toStream = function() {return {audioStream:Readable.from([Buffer.from('neural-mp3')])};};
    MsEdgeTTS.prototype.close = function() {};
    globalThis.fetch = async (url, options={}) => {
      if (String(url).endsWith('/auth/v1/user')) return options.headers.Authorization==='Bearer valid'
        ? Response.json({id:'learner'}) : new Response('{}',{status:401});
      if (String(url)==='https://api.groq.com/openai/v1/audio/transcriptions') {
        const bytes=new Uint8Array(await options.body.get('file').arrayBuffer());
        if (options.body.get('model')!=='whisper-large-v3' || options.body.has('prompt')) throw new Error('Invalid model or answer leaked');
        if (bytes[0]===3) return new Response('{}',{status:503});
        if (bytes[0]===4) return new Response('{}',{status:429});
        if (bytes[0]===5) return Response.json({text:'',segments:[]});
        return Response.json({text:'Put the gloves on.'});
      }
      throw new Error('Unexpected external request');
    };
  `);
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1'); await once(reservation,'listening');
  const port = reservation.address().port;
  await new Promise(resolve=>reservation.close(resolve));
  const root = fileURLToPath(new URL('..',import.meta.url));
  const child = spawn(process.execPath,['--import',preload,join(root,'server.js')],{
    cwd:root,env:{...process.env,PORT:String(port),GROQ_API_KEY:'test-only',SUPABASE_URL:'https://auth.test.invalid',SUPABASE_ANON_KEY:'test-only'},
    stdio:['ignore','pipe','pipe']
  });
  t.after(async()=>{
    if(child.exitCode===null){const exit=once(child,'exit');child.kill();await exit;}
    await rm(temp,{recursive:true,force:true});
  });
  let errors='';child.stderr.on('data',chunk=>{errors+=chunk;});
  await new Promise((resolve,reject)=>{
    child.stdout.on('data',chunk=>{if(String(chunk).includes('Server running'))resolve();});
    child.on('error',reject);child.on('exit',code=>reject(new Error(`Server exited ${code}: ${errors}`)));
  });
  const speech = token=>fetch(`http://127.0.0.1:${port}/api/speech`,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({text:'Hello',locale:'en-US',voiceType:'female'})});
  assert.equal((await speech()).status,401);
  const audio = await speech('valid');
  assert.equal(audio.status,200);
  assert.match(audio.headers.get('content-type'),/^audio\/mpeg/);
  assert.equal(await audio.text(),'neural-mp3');
  const transcription = ({token='valid',locale='en-US',mime='audio/mp4',body=Buffer.alloc(256,1)}={})=>fetch(`http://127.0.0.1:${port}/api/transcription?locale=${locale}`,{
    method:'POST',headers:{'Content-Type':mime,...(token?{Authorization:`Bearer ${token}`}:{})},body:new Blob([body],{type:mime})
  });
  assert.equal((await transcription({token:null})).status,401);
  assert.equal((await transcription({token:'invalid'})).status,401);
  for(const options of [{locale:'constructor'},{mime:'text/plain'},{body:Buffer.alloc(0)}])assert.equal((await transcription(options)).status,400);
  for(const mime of ['audio/mp4;codecs=mp4a.40.2','audio/webm;codecs=opus']){
    const result=await transcription({mime});
    assert.equal(result.status,200);
    assert.equal(result.headers.get('cache-control'),'no-store');
    assert.deepEqual(await result.json(),{text:'Put the gloves on.'});
  }
  for(const [value,status,error] of [[3,503,'transcription_unavailable'],[4,429,'transcription_rate_limited'],[5,422,'no_speech']]){
    const result=await transcription({body:Buffer.alloc(256,value)});
    assert.equal(result.status,status);
    assert.deepEqual(await result.json(),{error});
  }
});
