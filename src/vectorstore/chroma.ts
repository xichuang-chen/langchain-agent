import { Chroma } from "@langchain/community/vectorstores/chroma";
import { OpenAIEmbeddings } from "@langchain/openai";


export async function getChromaVectorStore() {
  const embeddings = new OpenAIEmbeddings({
    // 你当前走的可能是 LiteLLM/自建 OpenAI 兼容网关，不一定支持 text-embedding-3-large
    // 使用 v1/models 查看支持的模型
    model: "text-embedding-3-small-1",
  });



  const vectorStore = await Chroma.fromExistingCollection(
    embeddings,
    {
      collectionName: "long_memory",
      clientParams: {
        host: "localhost",
        port: 8000, 
      },
    }
  );

  return vectorStore;
}
