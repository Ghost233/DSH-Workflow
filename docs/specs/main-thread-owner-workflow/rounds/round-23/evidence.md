# 第 23 轮范围

修复 F-19：父进程在 fork 前分配独占临时容器，子进程仅在容器内创建 fixture；等待子进程退出后清理容器，不依赖 checkpoint 返回 root。新增真实 fixture 创建后、checkpoint 前故障测试。主线程独占三个 fixture/test 文件及轮次文档。生产代码和合同不变。

正式范围：restart 3 项 + recovery-session 11 项。错误注入为真实测试，不声称动态验证 timeout。T-22 仍开发中，T-23/T-15 阻塞。
