'use strict';
const{EventEmitter}=require('node:events');
const{utilityProcess}=require('electron');
// Native speech handles live outside the Electron main process. An engine exit
// must fail that voice request, without terminating the chat or the application.
class VoiceProcess extends EventEmitter{
 constructor(file,{workerData,onExit=()=>{}}){
  super();this.expectedExit=false;this.exited=false;
  const child=utilityProcess.fork(file,[],{stdio:'pipe',serviceName:'Haruna local voice'});this.child=child;
  this.closed=new Promise(resolve=>child.once('exit',code=>{this.exited=true;onExit({exitCode:Number.isInteger(code)?code:null,expected:this.expectedExit});resolve(code);this.emit('exit',code);}));
  child.stdout?.resume();child.stderr?.resume();
  child.on('message',data=>this.emit('message',data));
  child.on('error',()=>{if(this.listenerCount('error'))this.emit('error',Error('Voice process failed'));});
  child.once('spawn',()=>{try{if(this.expectedExit)child.kill();else child.postMessage({workerData});}catch{this.emit('error',Error('Voice initialization IPC failed'));}});
 }
 postMessage(data){if(this.expectedExit||this.exited)throw Error('Voice process already closed');this.child.postMessage(data);}
 terminate(){this.expectedExit=true;if(!this.exited)this.child.kill();return this.closed;}
}
module.exports={VoiceProcess};
