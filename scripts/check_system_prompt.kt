package com.proxyslabs.haruna.diagnostics
object SystemPromptCheck {
 @JvmStatic fun main(args:Array<String>){
  val original="Identidade\nPersonalidade\nArquivo GGUF: \"modelo.gguf\""
  check(LabSystemPrompt.apply(original,LabSystemPrompt.CURRENT,true)==original)
  check(LabSystemPrompt.apply(original,LabSystemPrompt.FACTUAL,false)==original)
  check(LabSystemPrompt.apply(original,"unknown",true)==original)
  check(LabSystemPrompt.apply(original,LabSystemPrompt.FACTUAL,true)==original+"\n"+LabSystemPrompt.ADDITION)
  println("PASS system prompt: exact append, unchanged current, non-authorized/release path unchanged; no weights/inference tested.")
 }
}
