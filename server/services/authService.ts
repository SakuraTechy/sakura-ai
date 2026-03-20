import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { connect as tlsConnect, TLSSocket, SecureContext, createSecureContext } from 'tls';
import { PrismaClient } from '../../src/generated/prisma/index.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

const SMTP_CONFIG = {
  host: process.env.SMTP_HOST || '',
  port: parseInt(process.env.SMTP_PORT || '465'),
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || '',
  from: process.env.SMTP_FROM || 'noreply@sakura-ai.local'
};

const verificationCodes = new Map<string, { code: string; expiresAt: number }>();

export interface AuthUser {
  id: number;
  email: string;
  username: string;
  accountName: string | null;
  project: string | null;
  isSuperAdmin: boolean;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface AuthTokenPayload {
  userId: number;
  username: string;
  email: string;
  isSuperAdmin: boolean;
}

export class AuthService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  private isSMTPConfigured(): boolean {
    return !!(SMTP_CONFIG.host && SMTP_CONFIG.user && SMTP_CONFIG.pass);
  }

  private base64Encode(str: string): string {
    return Buffer.from(str).toString('base64');
  }

  private async sendEmailViaTLS(email: string, code: string): Promise<{ success: boolean; error?: string }> {
    const { host, port, user, pass, from } = SMTP_CONFIG;

    return new Promise((resolve) => {
      let socket: TLSSocket | null = null;
      let buffer = '';
      let step = 0;
      let greetingReceived = false;
      let lastError = '';

      const subject = '【Sakura AI】重置密码验证码';
      const body = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #8b5cf6;">重置密码验证码</h2>
  <p>您好！</p>
  <p>您正在重置 Sakura AI 账号的密码，请使用以下验证码：</p>
  <div style="background: #f3f4f6; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px;">
    <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #8b5cf6;">${code}</span>
  </div>
  <p style="color: #6b7280; font-size: 14px;">验证码有效期为 5 分钟，请勿泄露给他人。</p>
</body>
</html>`;

      const date = new Date().toUTCString();
      const messageId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@sakura-ai.local>`;
      
      const emailContent = [
        `From: ${from}`,
        `To: ${email}`,
        `Subject: ${subject}`,
        `Date: ${date}`,
        `Message-ID: ${messageId}`,
        `MIME-Version: 1.0`,
        `Content-Type: text/html; charset=UTF-8`,
        '',
        body,
        '.'
      ].join('\r\n');

      // SMTP 协议步骤
      const smtpSteps: { cmd: string; expectCode: number }[] = [
        { cmd: `EHLO ${host}`, expectCode: 250 },
        { cmd: `AUTH LOGIN`, expectCode: 334 },
        { cmd: this.base64Encode(user), expectCode: 334 },
        { cmd: this.base64Encode(pass), expectCode: 235 },
        { cmd: `MAIL FROM:<${from}>`, expectCode: 250 },
        { cmd: `RCPT TO:<${email}>`, expectCode: 250 },
        { cmd: `DATA`, expectCode: 354 },
        { cmd: emailContent, expectCode: 250 }
      ];

      const sendNext = () => {
        if (step < smtpSteps.length) {
          const { cmd } = smtpSteps[step];
          console.log(`📤 SMTP 发送: ${cmd.substring(0, 50)}...`);
          socket?.write(cmd + '\r\n');
          step++;
        }
      };

      const processData = (data: string) => {
        buffer += data;
        const lines = buffer.split('\r\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.length < 4) continue;
          const code = parseInt(line.substring(0, 3));
          const isFinal = line[3] === ' ';

          if (isFinal) {
            console.log(`📨 SMTP 响应: ${code} ${line.substring(4)}`);

            // 收到 220 问候后立即发送 EHLO
            if (code === 220 && !greetingReceived) {
              greetingReceived = true;
              step = 0;
              sendNext();
              return;
            }

            // 检查期望的响应码
            const expected = smtpSteps[step - 1]?.expectCode;
            if (expected && code === expected) {
              if (step >= smtpSteps.length) {
                console.log(`✅ 验证码邮件已发送至 ${email}`);
                socket?.end();
                resolve({ success: true });
              } else {
                sendNext();
              }
            } else if (code >= 400 && code < 600) {
              console.log(`❌ SMTP 错误: ${line}`);
              lastError = line.substring(4) || line;
              socket?.end();
              resolve({ success: false, error: lastError });
            }
          }
        }
      };

      try {
        socket = tlsConnect({
          host,
          port,
          secureContext: createSecureContext({ minVersion: 'TLSv1.2' }),
          servername: host,
          rejectUnauthorized: false
        }, () => {
          console.log(`🔌 TLS 连接已建立 ${host}:${port}`);
        });

        socket.on('data', (data) => {
          processData(data.toString());
        });

        socket.on('error', (err) => {
          console.log(`❌ TLS 错误: ${err.message}`);
          resolve({ success: false, error: err.message });
        });

        socket.on('timeout', () => {
          console.log(`❌ TLS 连接超时`);
          socket?.destroy();
          resolve({ success: false, error: '连接超时' });
        });

        socket.on('close', () => {
          if (!greetingReceived) {
            console.log(`❌ TLS 连接建立失败`);
            resolve({ success: false, error: '连接建立失败' });
          } else if (step < smtpSteps.length) {
            console.log(`❌ SMTP 连接过早关闭，步骤: ${step}`);
            resolve({ success: false, error: lastError || 'SMTP 连接过早关闭' });
          }
        });

        socket.setTimeout(60000);

      } catch (err: any) {
        console.log(`❌ TLS 异常: ${err.message}`);
        resolve({ success: false, error: err.message });
      }
    });
  }

  async sendResetCode(email: string): Promise<void> {
    const user = await this.prisma.users.findUnique({ where: { email } });
    if (!user) throw new Error('该邮箱未注册');

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    verificationCodes.set(email, { code, expiresAt: Date.now() + 5 * 60 * 1000 });

    console.log('\n========================================');
    console.log('📧 发送重置密码验证码');
    console.log('----------------------------------------');
    console.log(`📮 收件人: ${email}`);
    console.log(`🔢 验证码: ${code}`);
    console.log(`⏰ 有效期: 5 分钟`);
    console.log('========================================\n');

    if (this.isSMTPConfigured()) {
      const result = await this.sendEmailViaTLS(email, code);
      if (!result.success) {
        console.log('💡 SMTP 发送失败，验证码可通过上方日志获取\n');
        // 根据错误类型给出友好提示
        const errMsg = result.error || '';
        if (errMsg.includes('535') || errMsg.toLowerCase().includes('authentication failed')) {
          throw new Error('邮件发送失败：SMTP 账号或密码错误，请联系管理员检查邮件配置');
        } else if (errMsg.includes('timeout') || errMsg.includes('超时')) {
          throw new Error('邮件发送失败：连接超时，请检查网络或 SMTP 服务器配置');
        } else {
          throw new Error(`邮件发送失败：${errMsg || 'SMTP 服务异常'}`);
        }
      }
    } else {
      console.log('💡 SMTP 未配置，验证码已显示在上方\n');
    }
  }

  verifyResetCode(email: string, code: string): boolean {
    const record = verificationCodes.get(email);
    if (!record) return false;
    if (Date.now() > record.expiresAt) {
      verificationCodes.delete(email);
      return false;
    }
    return record.code === code;
  }

  async resetPassword(email: string, code: string, newPassword: string): Promise<void> {
    if (!this.verifyResetCode(email, code)) throw new Error('验证码错误或已过期');

    const user = await this.prisma.users.findUnique({ where: { email } });
    if (!user) throw new Error('用户不存在');

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.prisma.users.update({
      where: { id: user.id },
      data: { password_hash: hashedPassword }
    });
    verificationCodes.delete(email);
    console.log(`✅ 用户密码重置成功: ${email} (ID: ${user.id})`);
  }

  async login(credentials: LoginCredentials): Promise<{ user: AuthUser; token: string }> {
    const { username, password } = credentials;
    const user = await this.prisma.users.findUnique({ where: { username } });
    if (!user) throw new Error('用户名或密码错误');

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) throw new Error('用户名或密码错误');

    const token = jwt.sign(
      { userId: user.id, username: user.username, email: user.email, isSuperAdmin: user.is_super_admin },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] }
    );

    console.log(`✅ 用户登录成功: ${username} (ID: ${user.id})`);
    return {
      user: {
        id: user.id, email: user.email, username: user.username,
        accountName: user.account_name, project: user.project, isSuperAdmin: user.is_super_admin
      },
      token
    };
  }

  async getUserFromToken(token: string): Promise<AuthUser> {
    const payload = jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
    const user = await this.prisma.users.findUnique({ where: { id: payload.userId } });
    if (!user) throw new Error('用户不存在');
    return {
      id: user.id, email: user.email, username: user.username,
      accountName: user.account_name, project: user.project, isSuperAdmin: user.is_super_admin
    };
  }

  async createUser(userData: {
    email: string; username: string; password: string;
    accountName?: string; project?: string; department?: string; isSuperAdmin?: boolean;
  }): Promise<AuthUser> {
    const existingUser = await this.prisma.users.findUnique({ where: { username: userData.username } });
    if (existingUser) throw new Error('用户名已存在');
    const existingEmail = await this.prisma.users.findUnique({ where: { email: userData.email } });
    if (existingEmail) throw new Error('邮箱已存在');

    const hashedPassword = await bcrypt.hash(userData.password, 10);
    const user = await this.prisma.users.create({
      data: {
        email: userData.email, username: userData.username, password_hash: hashedPassword,
        account_name: userData.accountName || null, project: userData.project || null,
        department: userData.department || null,
        is_super_admin: userData.isSuperAdmin || false
      }
    });
    console.log(`✅ 用户创建成功: ${userData.username} (ID: ${user.id})`);
    return {
      id: user.id, email: user.email, username: user.username,
      accountName: user.account_name, project: user.project, isSuperAdmin: user.is_super_admin
    };
  }

  async changePassword(userId: number, oldPassword: string, newPassword: string): Promise<void> {
    const user = await this.prisma.users.findUnique({ where: { id: userId } });
    if (!user) throw new Error('用户不存在');
    const isOldPasswordValid = await bcrypt.compare(oldPassword, user.password_hash);
    if (!isOldPasswordValid) throw new Error('旧密码错误');
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.prisma.users.update({ where: { id: userId }, data: { password_hash: hashedPassword } });
    console.log(`✅ 用户密码修改成功: ID ${userId}`);
  }
}