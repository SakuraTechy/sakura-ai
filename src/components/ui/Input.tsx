import React, { forwardRef } from 'react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import { Eye, EyeOff, Search, AlertCircle, CheckCircle2 } from 'lucide-react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  success?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  variant?: 'default' | 'filled' | 'outline';
  inputSize?: 'sm' | 'md' | 'lg';
  showPassword?: boolean;
  onTogglePassword?: () => void;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({
  className = '',
  label,
  error,
  success,
  helperText,
  leftIcon,
  rightIcon,
  variant = 'outline',
  inputSize = 'md',
  type = 'text',
  showPassword,
  onTogglePassword,
  disabled,
  required,
  ...props
}, ref) => {
  const [isFocused, setIsFocused] = React.useState(false);
  const [internalShowPassword, setInternalShowPassword] = React.useState(false);
  
  const handleTogglePassword = () => {
    if (onTogglePassword) {
      onTogglePassword();
    } else {
      setInternalShowPassword(!internalShowPassword);
    }
  };
  
  const isPasswordVisible = showPassword ?? internalShowPassword;
  const isPassword = type === 'password';
  const actualType = isPassword && isPasswordVisible ? 'text' : type;
  
  const baseInputClasses = 'w-full transition-all duration-200 focus:outline-none';
  
  const sizeClasses = {
    sm: 'h-9 px-3 text-sm',
    md: 'h-11 px-4 text-base',
    lg: 'h-13 px-5 text-lg',
  };
  
  const variantClasses = {
    default: clsx(
      'border border-gray-300 rounded-lg bg-white',
      'dark:border-gray-600 dark:bg-gray-800',
      'focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20',
      'dark:focus:border-blue-400',
      error && 'border-red-500 focus:border-red-500 focus:ring-red-500/20',
      success && 'border-green-500 focus:border-green-500 focus:ring-green-500/20',
      disabled && 'bg-gray-50 text-gray-500 cursor-not-allowed dark:bg-gray-700'
    ),
    filled: clsx(
      'border-0 rounded-xl bg-gray-100 dark:bg-gray-800',
      'focus:bg-white focus:ring-2 focus:ring-blue-500/20',
      'dark:focus:bg-gray-700',
      error && 'bg-red-50 focus:bg-red-50 focus:ring-red-500/20 dark:bg-red-900/20',
      success && 'bg-green-50 focus:bg-green-50 focus:ring-green-500/20 dark:bg-green-900/20',
      disabled && 'opacity-50 cursor-not-allowed'
    ),
    outline: clsx(
      'border-2 border-gray-200 rounded-xl bg-transparent',
      'dark:border-gray-700',
      'focus:border-blue-500 focus:bg-white dark:focus:bg-gray-800',
      'hover:border-gray-300 dark:hover:border-gray-600',
      error && 'border-red-300 focus:border-red-500',
      success && 'border-green-300 focus:border-green-500',
      disabled && 'opacity-50 cursor-not-allowed'
    ),
  };
  
  const labelClasses = clsx(
    'block text-sm font-medium mb-2 transition-colors',
    error ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-300',
    required && 'after:content-["*"] after:ml-1 after:text-red-500'
  );
  
  const helperTextClasses = clsx(
    'mt-2 text-sm',
    error ? 'text-red-600 dark:text-red-400 font-medium' :
    success ? 'text-green-600 dark:text-green-400' :
    'text-gray-600 dark:text-gray-400'
  );
  
  return (
    <div className="w-full">
      {label && (
        <motion.label
          className={labelClasses}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {label}
        </motion.label>
      )}
      
      <motion.div 
        className="relative"
        whileFocus={{ scale: 1.01 }}
        transition={{ duration: 0.1 }}
      >
        {leftIcon && (
          <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600 dark:text-gray-500">
            {leftIcon}
          </div>
        )}
        
        <input
          ref={ref}
          type={actualType}
          className={clsx(
            baseInputClasses,
            sizeClasses[inputSize],
            variantClasses[variant],
            leftIcon && 'pl-10',
            (rightIcon || isPassword || error || success) && 'pr-10',
            className
          )}
          disabled={disabled}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          {...props}
        />
        
        <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center gap-1">
          {/* Status Icons */}
          {error && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="text-red-500"
            >
              <AlertCircle size={16} />
            </motion.div>
          )}
          
          {success && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="text-green-500"
            >
              <CheckCircle2 size={16} />
            </motion.div>
          )}
          
          {/* Password Toggle */}
          {isPassword && (
            <motion.button
              type="button"
              onClick={handleTogglePassword}
              className="text-gray-600 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
            >
              {isPasswordVisible ? <EyeOff size={16} /> : <Eye size={16} />}
            </motion.button>
          )}
          
          {/* Custom Right Icon */}
          {rightIcon && !error && !success && !isPassword && (
            <div className="text-gray-600 dark:text-gray-500">
              {rightIcon}
            </div>
          )}
        </div>
        
        {/* Focus Ring Animation */}
        {isFocused && (
          <motion.div
            className="absolute inset-0 rounded-xl border-2 border-blue-500 pointer-events-none"
            initial={{ opacity: 0, scale: 1.02 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
            transition={{ duration: 0.2 }}
          />
        )}
      </motion.div>
      
      {/* Helper Text */}
      {(error || success || helperText) && (
        <motion.p
          className={helperTextClasses}
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {error || success || helperText}
        </motion.p>
      )}
    </div>
  );
});

Input.displayName = 'Input';