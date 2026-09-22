/**
 * 初始化数据脚本（种子数据）。
 *
 * 为什么管理员账号不写进 db/schema.sql：密码要经过哈希，直接把某个哈希串硬编码
 * 进 SQL 文件，一旦哈希参数和代码里的不一致就永远登不进去，而且报错毫无指向性。
 * 放在这里由代码统一生成，算法永远与登录校验保持一致。
 *
 * 编译后位于 dist/seed.js，容器部署时直接 `node dist/seed.js` 即可，
 * 不需要在生产镜像里带上 ts-node。
 *
 * 用法：npm run db:seed
 * 幂等：重复执行不会重复创建，可以安全地放进部署流程。
 */
import { PrismaClient } from '@prisma/client';
import { PasswordService } from './modules/auth/password.service';

const prisma = new PrismaClient();
const passwordService = new PasswordService();

async function main(): Promise<void> {
  console.log('[seed] 开始初始化...');

  // ---------------------------------------------------------------- 管理员
  const username = (process.env.ADMIN_USERNAME || 'admin').toLowerCase();
  const email = process.env.ADMIN_EMAIL || 'admin@example.com';
  const plainPassword = process.env.ADMIN_PASSWORD || 'Admin@123456';
  const nickname = process.env.ADMIN_NICKNAME || '站长';

  const strengthError = passwordService.validateStrength(plainPassword);
  if (strengthError) {
    console.error(`[seed] ADMIN_PASSWORD 强度不足：${strengthError}`);
    process.exitCode = 1;
    return;
  }

  const existingAdmin = await prisma.user.findFirst({
    where: { OR: [{ username }, { email: { equals: email, mode: 'insensitive' } }] },
  });

  if (existingAdmin) {
    // 刻意不重置密码：管理员后来自己改过密码，seed 再跑一次如果把它改回去会很危险
    console.log(`[seed] 管理员「${existingAdmin.username}」已存在，跳过创建（密码保持原样）`);
    if (existingAdmin.role !== 'admin' || existingAdmin.status !== 'active') {
      await prisma.user.update({
        where: { id: existingAdmin.id },
        data: { role: 'admin', status: 'active' },
      });
      console.log('[seed] 已将其角色修正为 admin、状态置为 active');
    }
  } else {
    await prisma.user.create({
      data: {
        username,
        email,
        nickname,
        passwordHash: await passwordService.hash(plainPassword),
        role: 'admin',
        status: 'active',
      },
    });
    console.log(`[seed] 已创建管理员：${username} / ${email}`);
    console.log(`[seed] 初始密码：${plainPassword}  ⚠️ 登录后请立即修改`);
  }

  // ---------------------------------------------------------------- 分类
  // 分类只能由管理员维护（FR-3.1），预置几个常见分类，作者发文时直接选用
  const categories = [
    { name: '后端', slug: 'backend', description: '服务端、数据库、架构', sortOrder: 10 },
    { name: '前端', slug: 'frontend', description: '浏览器、框架、工程化', sortOrder: 20 },
    { name: '运维', slug: 'devops', description: '部署、监控、性能调优', sortOrder: 30 },
    { name: '随笔', slug: 'essay', description: '思考与记录', sortOrder: 40 },
  ];

  let createdCategories = 0;
  for (const category of categories) {
    const exists = await prisma.category.findUnique({ where: { slug: category.slug } });
    if (!exists) {
      await prisma.category.create({ data: category });
      createdCategories += 1;
    }
  }
  console.log(`[seed] 分类就绪（本次新建 ${createdCategories} 个）`);

  // ---------------------------------------------------------------- 站点配置兜底
  // db/schema.sql 已写入初始值，这里只补「升级场景下新增的键」
  const defaults: { key: string; value: string; description: string }[] = [
    { key: 'site_name', value: '我的博客', description: '站点名称' },
    { key: 'site_description', value: '技术、思考与记录', description: '站点副标题 / SEO description' },
    { key: 'per_page', value: '12', description: '前台列表每页文章数' },
    { key: 'register_enabled', value: 'true', description: '是否开放自助注册' },
    { key: 'register_need_approve', value: 'true', description: '新注册账号是否需要管理员审核' },
    { key: 'comment_enabled', value: 'true', description: '是否开启评论' },
    { key: 'comment_need_approve', value: 'true', description: '新评论是否需要审核' },
    { key: 'comment_allow_guest', value: 'true', description: '是否允许未登录访客评论' },
    { key: 'sensitive_words', value: '', description: '敏感词列表，逗号分隔' },
    { key: 'social_links', value: '[]', description: '社交链接 JSON 数组' },
  ];

  for (const item of defaults) {
    await prisma.siteSetting.upsert({
      where: { settingKey: item.key },
      // 已存在就不动，避免覆盖管理员改过的值
      update: {},
      create: { settingKey: item.key, settingValue: item.value, description: item.description },
    });
  }
  console.log(`[seed] 站点配置已就绪（${defaults.length} 项）`);

  console.log('[seed] 完成');
}

main()
  .catch((error) => {
    console.error('[seed] 执行失败：', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
