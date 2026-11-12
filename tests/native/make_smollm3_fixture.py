"""Tiny RANDOM real SmolLM3 architecture (RoPE + NoPE). State equivalence, never quality/speed."""
from pathlib import Path
import sys
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'third_party/llama.cpp/gguf-py'))
import gguf
out=Path(sys.argv[1]);out.parent.mkdir(parents=True,exist_ok=True)
w=gguf.GGUFWriter(out, 'smollm3')
w.add_name('RANDOM SmolLM3 state fixture');w.add_context_length(8192);w.add_embedding_length(64);w.add_block_count(4);w.add_feed_forward_length(128);w.add_head_count(4);w.add_head_count_kv(2);w.add_rope_dimension_count(16);w.add_layer_norm_rms_eps(1e-5)
b=list(range(ord('!'),ord('~')+1))+list(range(0xa1,0xac+1))+list(range(0xae,0xff+1));m={x:chr(x) for x in b};n=0
for x in range(256):
 if x not in m:m[x]=chr(256+n);n+=1
vocab=[m[i] for i in range(256)]+['<s>','</s>','<unk>','!!']
w.add_tokenizer_model('gpt2');w.add_tokenizer_pre('gpt-2');w.add_token_list(vocab);w.add_token_types([1]*256+[3,3,2,1]);w.add_token_merges(["! !"]);w.add_bos_token_id(256);w.add_eos_token_id(257);w.add_unk_token_id(258);w.add_add_bos_token(True)
w.add_chat_template("{{ bos_token }}{% for message in messages %}{{ message['role'] + ': ' + message['content'] + '\\n' }}{% endfor %}{% if add_generation_prompt %}assistant: {% endif %}")
rng=np.random.default_rng(431)
def add(name,shape,norm=False):w.add_tensor(name,np.ones(shape,dtype=np.float32) if norm else rng.normal(0,.05,shape).astype(np.float32))
add('token_embd.weight',(len(vocab),64));add('output_norm.weight',(64,),True);add('output.weight',(len(vocab),64))
for i in range(4):
 for name,shape,norm in [('attn_norm',(64,),True),('attn_q',(64,64),False),('attn_k',(32,64),False),('attn_v',(32,64),False),('attn_output',(64,64),False),('ffn_norm',(64,),True),('ffn_gate',(128,64),False),('ffn_up',(128,64),False),('ffn_down',(64,128),False)]:add(f'blk.{i}.{name}.weight',shape,norm)
w.write_header_to_file();w.write_kv_data_to_file();w.write_tensors_to_file();w.close();print('Created tiny random GGUF state fixture:',out.stat().st_size,'bytes')
