# 第41轮

真实producer在prompt持久后ack前SIGKILL，再明确注入坏row/torn tail/坏budget三种负向持久输入，新Runtime应只读暂停、零执行且不修写损坏证据。另真实admission在临时write前对owned workflows目录chmod500，原writeFile实际EACCES，不能返回receipt/扣减/启动；恢复权限。仅proof，正式预计14项。
