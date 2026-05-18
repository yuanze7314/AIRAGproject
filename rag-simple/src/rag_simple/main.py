
from langchain_core.documents import Document
# 导入文档转换器，将PDF、word等内容转换为document方便后续处理
from langchain_chroma import Chroma
# 导入Chroma数据库,存放上面那些数字（向量）的仓库。
from langchain_core.output_parsers import StrOutputParser
# 导入 字符串输出解析器。模型返回的结果通常包含很多冗余信息（如使用量、模型名等），这个工具负责把纯文本答案“提取”出来，直接显示给你。
from langchain_core.prompts import PromptTemplate
# 导入提示词模板
from langchain_huggingface import HuggingFaceEmbeddings
# 导入文本向量化的嵌入模型接口，即BAAI General Embedding模型
from langchain_openai import ChatOpenAI
# 导入 OpenAI 聊天模型接口。LLM模型接口，LLM由于训练成本巨高一般都是使用现有供应商的。
from langchain_text_splitters import RecursiveCharacterTextSplitter
# 导入文本分割器
from env_utils import DEEPSEEK_API_KEY
# 从你自己的项目文件（src/rag_simple/env_utils.py）中导入 API 密钥。

def load_document_from_markdown(file_path):
    # def 定义函数 名称（调用函数）
    """从Markdown文件加载文档内容"""
    with open(file_path, 'r', encoding='utf-8') as file:
        # with 保证文件在读取完后自动关闭，防止文件被一直占用；file_path：要打开的文件地址；'r'：代表 Read（只读模式）。防止程序不小心修改了原始文档。 as 重新定义名称
        content = file.read()
    #   访问file文件对象将所有文本存储到content变量中
    return content
# 函数调用完要输出content

def get_vector_store():
    # 初始化嵌入模型
    embeddings = HuggingFaceEmbeddings(
        model_name="BAAI/bge-small-zh-v1.5",
        model_kwargs={'device': 'cpu'},
        encode_kwargs={'normalize_embeddings': True}
    )
    # 采用智源研究院（BAAI）开发的中文小型模型，调用模型名称，强制模型在CPU上运行，开启归一化

    # 创建向量存储
    vectorstore = Chroma(
        collection_name='t_news',
        embedding_function=embeddings,
        persist_directory='./chroma_db'
    )
    return vectorstore
# 配置我的Chroma数据库，命名，使用上述BEG模型转化文本，持久化目录保存在制定文件夹里面，方便下回运行程序后，不需要重新文本转化。

def save_to_vector():
    """预处理阶段，加载 分片 索引 存储至向量库"""

    # 加载文档
    handbook_content = load_document_from_markdown("employee_handbook.md")
    # 转化文档
    # 创建文档对象 - 将整个内容拆分为多个文档
    documents = [Document(page_content=handbook_content, metadata={"source": "employee_handbook"})]
    print(f"加载到 {len(documents)} 个Document")
    print(documents)
    # 把纯文本包装成 LangChain 认可的 Document 对象。
    # 文本分割器
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=200,# 每个碎片最多 200 字
        chunk_overlap=50,# 碎片之间重复 50 字
        length_function=len # 使用 Python 自带的 len() 函数来计算字数。
    )
    # 分割文档
    split_docs = text_splitter.split_documents(documents)
    print(f"已将文档分割成 {len(split_docs)} 个块")
    for doc in split_docs:
        print("-" * 60)
        print(doc)

    # 创建向量存储
    vectorstore = get_vector_store()

    ids = ['id' + str(i + 1) for i in range(len(split_docs))]
    vectorstore.add_documents(split_docs, ids=ids)
    print('存储至向量数据库完成')
    # ids：给每个碎片起个身份证号（id1, id2...）。这样以后你想更新或删除某个碎片时，可以通过 ID 快速定位。
    # add_documents：这是最关键的一步。BGE 模型会自动把这些碎片变成一串数字（向量），然后存入你指定的 persist_directory（即 chroma_db 文件夹）。

    print('验证向量数据库')
    all_data = vectorstore.get(
        include=['embeddings', 'documents', 'metadatas']  # 取出来指定要包含的字段 vectorstore.get()：这是 Chroma 提供的查询命令。metadatas可以理解为元数据。document为原文，embeddings为对应的数字向量
    )
    for i in range(len(all_data['documents'])):  # len查询字段长度或者字典内对象个数
        print("=" * 60)  # 分割线
        print(all_data['documents'][i])  # 输出指定document
        print(all_data['embeddings'][i]) # 输出指定embeddings


def ask_without_rag(llm, question):
    """直接向大模型提问（无RAG）"""
    prompt = PromptTemplate.from_template("请回答以下问题：{question}")   # Langchain获取用户输入问题的函数，定义占位符
    chain = prompt | llm | StrOutputParser()  # Langchain的管道语法数据流动模块顺序
    # prompt：把你的问题套进模板。
    # llm：把处理好的提示词发给 DeepSeek，模型生成原始回答。
    # StrOutputParser()：把模型返回的复杂数据包（包含 token 数、时间等）进行清洗，只留下纯文本字符串。
    response = chain.invoke({"question": question})  # 调用invoke函数实现上述管道语法进行求解，使用占位符来引入之前的变量
    return response


def ask_with_rag(llm, question):
    """使用RAG向大模型提问（分步展示）"""

    # 1. 在向量数据库中搜索相似文档
    vectorstore = get_vector_store() # 运行一遍之前打包好的数据库建立操作
    similar_docs = vectorstore.similarity_search(question, k=3)   # 输出有关question的前三相关语块

    # for i, doc in enumerate(similar_docs, 1):
    #     print(f"   文档 {i}:")
    #     print(f"   内容: {doc.page_content[:150]}...")  # 只显示前150个字符

    # 2. 构建上下文 提示词模板
    context = "\n".join([f"文档 {i + 1}: {doc.page_content}" for i, doc in enumerate(similar_docs)])# 使用换行符连接（给每段话加上标签文档X，
    prompt = PromptTemplate.from_template(f"""
    请根据以下企业文档内容回答用户的问题。如果文档中没有相关信息，请明确说明"根据现有规定，我没有找到相关信息"。
【企业文档内容】:{context}
【用户问题】:{question}""") # 定义prompt提示词环节输入给llm的内容，context取前面的，后续question为占位符，等后续的输入。

    # 3. 向大模型提问并获取回答:
    chain = prompt | llm | StrOutputParser()
    response = chain.invoke({"question": question}) # 引导用户输入question，执行管道语法
    return response


def search_vector():
    # 预定义的问题列表
    QUESTIONS = [
        "我们公司的年假是多少天？",
        "我去上海出差，住宿报销上限是多少？",
        "报销的截止日期是什么时候？",
        "试用期是多久？",
        "病假有多少天？"
    ]

    llm = ChatOpenAI(
        temperature=0.8,  # 创造力参数，调参用的
        model='deepseek-chat',
        api_key=DEEPSEEK_API_KEY, # 将key单独放文件里保密
        base_url="https://api.deepseek.com")

    # 对每个问题测试两种方式
    for i, question in enumerate(QUESTIONS, 1):
        print("*" * 80)
        print(f"{i}. 问题: {question}")

        # 无RAG的回答
        print("-" * 20 + "无RAG的回答" + "-" * 20)
        response_without_rag = ask_without_rag(llm, question)
        print(f"   {response_without_rag}")

        # 有RAG的回答
        print("-" * 20 + "有RAG的回答" + "-" * 20)
        response_with_rag = ask_with_rag(llm, question)
        print(f"   {response_with_rag}")


if __name__ == "__main__":  # 安全保护开关，便于其他文件调用这个文件封装的函数时候不触发全部操作，放在下面的函数才能运行
    # 提问前
    # save_to_vector()
    # 提问后
    search_vector()

# 这是后续的自主提问模块，注销上面，启用下面即可：
# def search_vector():
#     # 实例化 LLM（确保你的 API_KEY 有余额）
#     llm = ChatOpenAI(
#         temperature=0.2,  # 建议调低，让回答更准确
#         model='deepseek-chat',
#         api_key='your_deepseek_api_key',
#         base_url="https://api.deepseek.com")
#
#     print("--- 欢迎使用企业知识库助手（输入 'exit' 或 '退出' 结束对话） ---")
#
#     while True:
#         # 1. 获取用户输入
#         question = input("\n请输入您的问题: ").strip()
#
#         # 2. 设置退出条件
#         if question.lower() in ['exit', 'quit', '退出', 'q']:
#             print("再见！")
#             break
#
#         if not question:
#             continue
#
#         print("*" * 50)
#
#         # 3. 运行 RAG 流程
#         try:
#             print("正在检索并生成回答...\n")
#             response = ask_with_rag(llm, question)
#             print(f"【AI 回答】: \n{response}")
#         except Exception as e:
#             print(f"出错了: {e}")
#
#         print("*" * 50)
#
#
# if __name__ == "__main__":
#     search_vector()
