`SessionCheck.kt` executa a classe JNI real com um checkpoint SD1.5 completo fornecido explicitamente. Compilar com os mesmos arquivos Kotlin de SafetensorsSession/Native/Inspector/Architecture/ImagePackage/NezumiPackage/SafetensorsPackage e org.json; usar `java.library.path` para a biblioteca JNI compilada contra o SDK fixado pela aplicação.

Argumentos: `checkpoint.safetensors diretório-de-saída [1..4] [preview]`.

O teste usa 512×512, uma etapa Euler/discrete, CFG 7, seeds 424242 + índice. Isso comprova execução/arquivos/liberação e não qualidade de poucas etapas. O teste não baixa pesos, não integra dados de conversas e não é validação física no Android. Não adicionar pesos ao Git ou ao APK.
