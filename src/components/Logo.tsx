import React from 'react';
import { motion } from 'framer-motion';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
}

export function Logo({ size = 'md', showText = true, className = '' }: LogoProps) {
  const sizeClasses = {
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-12 w-12',
  };

  const iconSizes = {
    sm: 'h-5 w-5',
    md: 'h-6 w-6',
    lg: 'h-7 w-7',
  };

  const textSizes = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-3xl',
  };

  return (
    <motion.div 
      className={`flex items-center space-x-0 ${className}`}
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.2 }}
    >
      {/* Logo容器 - 现代化设计 */}
      {/* <motion.div 
        className={`
          ${sizeClasses[size]} 
          rounded-xl 
          overflow-hidden 
          shadow-md 
          hover:shadow-lg 
          transition-all duration-300
          bg-gradient-to-br from-blue-500 to-purple-600
          p-1
        `}
        whileHover={{ 
          boxShadow: '0 10px 25px rgba(59, 130, 246, 0.3)',
          y: -2 
        }}
      >
        <div className="w-full h-full bg-white dark:bg-gray-800 rounded-lg p-1">
          <img 
            src="/logo1.svg"
             alt="Sakura Logo"
            className={`${sizeClasses[size]} object-contain`} 
          />
        </div>
      </motion.div> */}
      <img
                  // src="/logo.png"
                  src="/logo1.svg"
                  alt="Sakura Logo"
                  className=" object-contain"
                  style={{ width: '75px', height: '75px' }}
                />
      {/* 系统名称 - 现代化排版 */}
      {showText && (
        <div className="flex flex-col">
          <motion.span 
            className={`
              ${textSizes[size]} 
              font-bold 
              bg-gradient-to-r from-blue-600 to-purple-600 
              bg-clip-text text-transparent
              dark:from-blue-400 dark:to-purple-400
            `}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
          >
            DNS AIgen
          </motion.span>
          {size !== 'sm' && (
            <motion.span 
              className="text-sm text-gray-700 dark:text-gray-600 font-medium tracking-wide"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
            >
              AI · 智能自动化平台
            </motion.span>
          )}
        </div>
      )}
    </motion.div>
  );
}

