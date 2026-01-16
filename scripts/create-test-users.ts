import { PrismaClient } from '../src/generated/prisma/index.js';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;

async function createTestUsers() {
  try {
    console.log('开始创建测试用户...\n');

    // 用户1: tanheng (V链部门)
    const user1 = await prisma.users.findUnique({ where: { username: 'tanheng' } });
    if (user1) {
      console.log('✅ tanheng 用户已存在，更新密码和部门...');
      await prisma.users.update({
        where: { id: user1.id },
        data: {
          password_hash: await bcrypt.hash('tanheng123', SALT_ROUNDS),
          department: 'V链',
          account_name: 'V链测试用户',
          is_super_admin: false
        }
      });
      console.log(`   用户名: tanheng, 密码: tanheng123, 部门: V链`);
    } else {
      await prisma.users.create({
        data: {
          username: 'tanheng',
          email: 'tanheng@test.com',
          password_hash: await bcrypt.hash('tanheng123', SALT_ROUNDS),
          department: 'V链',
          account_name: 'V链测试用户',
          is_super_admin: false
        }
      });
      console.log('✅ 创建 tanheng 用户成功');
      console.log(`   用户名: tanheng, 密码: tanheng123, 部门: V链`);
    }

    // 用户2: tanheng2 (V链2部门)
    const user2 = await prisma.users.findUnique({ where: { username: 'tanheng2' } });
    if (user2) {
      console.log('\n✅ tanheng2 用户已存在，更新密码和部门...');
      await prisma.users.update({
        where: { id: user2.id },
        data: {
          password_hash: await bcrypt.hash('tanheng2123', SALT_ROUNDS),
          department: 'V链2',
          account_name: 'V链2测试用户',
          is_super_admin: false
        }
      });
      console.log(`   用户名: tanheng2, 密码: tanheng2123, 部门: V链2`);
    } else {
      await prisma.users.create({
        data: {
          username: 'tanheng2',
          email: 'tanheng2@test.com',
          password_hash: await bcrypt.hash('tanheng2123', SALT_ROUNDS),
          department: 'V链2',
          account_name: 'V链2测试用户',
          is_super_admin: false
        }
      });
      console.log('\n✅ 创建 tanheng2 用户成功');
      console.log(`   用户名: tanheng2, 密码: tanheng2123, 部门: V链2`);
    }

    console.log('\n✅ 测试用户创建/更新完成');
    console.log('\n可以使用以下账户测试：');
    console.log('  1. tanheng / tanheng123 (V链部门 - 能看到V链的数据)');
    console.log('  2. tanheng2 / tanheng2123 (V链2部门 - 看不到V链的数据)');
    console.log('  3. admin / admin123 (超级管理员 - 能看到所有数据)');

  } catch (error) {
    console.error('❌ 创建用户失败:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createTestUsers();
