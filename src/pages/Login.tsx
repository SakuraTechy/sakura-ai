import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Alert } from 'antd';
import { User, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import NET from 'vanta/dist/vanta.net.min';
import * as THREE from 'three';
import '../styles/login.css';
import packageJson from '../../package.json';
import { Register } from './Register';
import { ForgotPassword } from './ForgotPassword';

export const Login: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'login' | 'register' | 'forgot'>('login');
  const { login } = useAuth();
  const navigate = useNavigate();

  // VANTA.js 相关
  const vantaRef = useRef<HTMLDivElement>(null);
  const vantaEffect = useRef<any>(null);

  // 初始化 VANTA.js NET 效果
  useEffect(() => {
    if (!vantaEffect.current && vantaRef.current) {
      vantaEffect.current = NET({
        el: vantaRef.current,
        THREE: THREE,
        mouseControls: true,
        touchControls: true,
        gyroControls: false,
        minHeight: 200.0,
        minWidth: 200.0,
        scale: 1.0,
        scaleMobile: 1.0,
        color: 0xa855f7,
        backgroundColor: 0x0f0a1e,
        points: 8.0,
        maxDistance: 20.0,
        spacing: 16.0,
        showDots: true
      });
    }

    return () => {
      if (vantaEffect.current) {
        vantaEffect.current.destroy();
        vantaEffect.current = null;
      }
    };
  }, []);

  // 生成网络背景元素（CSS 动画备用方案）
  useEffect(() => {
    const networkBg = document.getElementById('networkBg');
    if (!networkBg) return;

    networkBg.innerHTML = '';

    const lines = 20;
    for (let i = 0; i < lines; i++) {
      const line = document.createElement('div');
      line.className = 'network-line';
      line.style.top = Math.random() * 100 + '%';
      line.style.left = '-100px';
      line.style.width = Math.random() * 200 + 100 + 'px';
      line.style.animationDelay = Math.random() * 20 + 's';
      line.style.animationDuration = (Math.random() * 10 + 15) + 's';
      networkBg.appendChild(line);
    }

    const dots = 15;
    for (let i = 0; i < dots; i++) {
      const dot = document.createElement('div');
      dot.className = 'network-dot';
      dot.style.left = Math.random() * 100 + '%';
      dot.style.top = Math.random() * 100 + '%';
      dot.style.animationDelay = Math.random() * 2 + 's';
      networkBg.appendChild(dot);
    }
  }, []);

  const handleSubmit = async (values: { username: string; password: string }) => {
    setError(null);
    setLoading(true);

    try {
      await login(values.username, values.password);
      navigate('/');
    } catch (err: any) {
      setError(err.message || '登录失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen relative overflow-hidden">
      <div ref={vantaRef} className="absolute inset-0" style={{ zIndex: 0 }} />

      <div className="background-container">
        <div className="network-background" id="networkBg"></div>
        <div className="glow-effect glow-purple"></div>
        <div className="glow-effect glow-blue"></div>
      </div>

      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900" style={{ zIndex: -1 }} />

      <div className="relative z-10 h-screen flex items-center justify-center px-4 py-6">
        {view === 'register' ? (
          <Register
            onSwitchToLogin={() => {
              setView('login');
              form.setFieldsValue({ username: '', password: '' });
            }}
            onRegisterSuccess={() => {
              setView('login');
              form.setFieldsValue({ username: '', password: '' });
            }}
          />
        ) : view === 'forgot' ? (
          <ForgotPassword
            onBackToLogin={() => {
              setView('login');
              form.setFieldsValue({ username: '', password: '' });
            }}
          />
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="w-full max-w-md mx-auto"
          >
            <motion.div
              className="flex flex-col items-center mb-20 py-4"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.8 }}
            >
              <div className="w-[110px] h-[110px] mb-0 flex items-center justify-center">
                <img src="/logo1.svg" alt="Sakura Logo" className="w-full h-full object-contain" />
              </div>
              <h1 className="text-4xl font-bold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-purple-300 via-purple-200 to-purple-100 drop-shadow-[0_0_8px_rgba(168,85,247,0.5)]">
                Sakura AI
              </h1>
              <p className="text-sm font-light tracking-[0.15em] bg-clip-text text-transparent bg-gradient-to-r from-purple-300/90 via-purple-200/80 to-purple-100/90 drop-shadow-[0_0_4px_rgba(168,85,247,0.4)]">
                企业级 · 一站式智能自动化平台
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="backdrop-blur-xl bg-white/10 rounded-3xl p-8 shadow-2xl border border-white/20"
            >
              <AnimatePresence mode="wait">
                {error && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="mb-6">
                    <Alert message={error} type="error" closable onClose={() => setError(null)} className="login-alert rounded-xl" />
                  </motion.div>
                )}
              </AnimatePresence>

              <Form form={form} onFinish={handleSubmit} layout="vertical" requiredMark={false} className="space-y-5">
                <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]} className="login-input">
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <User className="w-5 h-5 text-purple-300 group-hover:text-purple-200 transition-colors" />
                    </div>
                    <Input placeholder="用户名" autoComplete="username" className="h-14 pl-12 pr-4 rounded-xl transition-all" />
                  </div>
                </Form.Item>

                <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]} className="login-input">
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none z-10">
                      <Lock className="w-5 h-5 text-purple-300 group-hover:text-purple-200 transition-colors" />
                    </div>
                    <Input.Password placeholder="密码" autoComplete="current-password" className="h-14 pl-12 pr-4 rounded-xl transition-all" />
                  </div>
                </Form.Item>

                <Form.Item className="mb-0">
                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    <Button type="primary" htmlType="submit" loading={loading} block className="login-button h-14 rounded-xl text-base font-semibold transition-all">
                      {loading ? '登录中...' : '登 录'}
                    </Button>
                  </motion.div>
                </Form.Item>
              </Form>

              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5, duration: 0.5 }} className="mt-4 pt-4 border-t border-white/10 text-center">
                <span className="text-purple-300/60 text-sm">还没有账号？</span>
                <Button type="link" onClick={() => setView('register')} className="text-purple-300 hover:text-purple-200 ml-2 p-0 h-auto text-sm">立即注册</Button>
                <span className="text-purple-300/60 text-sm mx-2">·</span>
                <Button type="link" onClick={() => setView('forgot')} className="text-purple-300 hover:text-purple-200 p-0 h-auto text-sm">忘记密码？</Button>
              </motion.div>
            </motion.div>

            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6, duration: 0.5 }} className="mt-20 flex flex-col gap-2 text-center">
              <span className="text-purple-300/50 text-sm">版本号：{packageJson.version}</span>
              <span className="text-purple-300/50 text-sm">Sakura AI. Powered by AI & Automation</span>
              <span className="text-purple-300/50 text-sm">Copyright © 2025-2026 SakuraTech. All rights reserved.</span>
            </motion.div>
          </motion.div>
        )}
      </div>
    </div>
  );
};