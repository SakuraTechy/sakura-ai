"use client"

import * as React from "react"
import clsx from "clsx"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./dialog"
import { Button } from "./button"
import { X } from "lucide-react"

export interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: React.ReactNode
  description?: React.ReactNode
  children?: React.ReactNode
  footer?: React.ReactNode
  showCloseButton?: boolean
  closeOnClickOutside?: boolean
  // 新增：更大尺寸和移动端表现
  size?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "wide" | "full" | "custom"
  // 新增：内容内边距
  contentPadding?: "sm" | "md" | "lg"
}

const sizeClasses: Record<NonNullable<ModalProps["size"]>, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
  xl: "sm:max-w-xl",
  "2xl": "sm:max-w-2xl",
  "3xl": "sm:max-w-3xl",
  // wide：更大尺寸，优化测试用例编辑体验
  wide: "w-[98vw] sm:w-[95vw] lg:w-[90vw] max-w-[1600px] min-w-[1100px]",
  // full：桌面也铺满宽度（谨慎使用）
  full: "w-[95vw] h-[90vh] max-w-none max-h-none",
  custom: "w-[1200px] min-w-[1500px] max-w-[1600px] ",
}

const paddingMap: Record<NonNullable<ModalProps["contentPadding"]>, string> = {
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  showCloseButton = true,
  closeOnClickOutside = true,
  size = "xl",
  contentPadding = "md",
}: ModalProps) {
  // ESC 关闭
  React.useEffect(() => {
    if (!isOpen) return
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleEsc)
    // 打开时锁定滚动
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", handleEsc)
      document.body.style.overflow = prevOverflow
    }
  }, [isOpen, onClose])

  return (
    <Dialog
      open={isOpen}
      // 让遮罩点击仅在允许时触发关闭（配合 onInteractOutside 防御）
      onOpenChange={(open) => {
        if (!open && closeOnClickOutside) {
          onClose()
        }
      }}
    >
      <DialogContent
        // 容器：移动端更接近全屏，桌面居中，最大高度限制在 85vh，内部滚动
        hideDefaultClose={showCloseButton}
        className={clsx(
          "p-0 overflow-hidden flex flex-col",
          size === "full" ? "" : "w-[96vw]",          // full尺寸时不使用默认宽度，移动端使用96vw
          size === "full" ? "" : "max-h-[100vh] sm:max-h-[90vh]", // full尺寸时不使用默认高度
          "rounded-none sm:rounded-2xl shadow-2xl",
          sizeClasses[size]  // 桌面端通过 max-w-* 控制宽度
        )}
        onInteractOutside={(e) => {
          if (!closeOnClickOutside) {
            e.preventDefault()
          }
        }}
      >
        {/* Header - sticky，操作区始终可见 */}
        {(title || showCloseButton || description) && (
          <div
            className={clsx(
              "sticky top-0 z-10 border-b border-gray-200 bg-white",
              paddingMap[contentPadding]
            )}
          >
            <div className="flex items-start sm:items-center justify-between gap-4">
              <div className="min-w-0">
                {title && (
                  <DialogTitle className="text-lg sm:text-xl font-semibold text-gray-900 truncate">
                    {title}
                  </DialogTitle>
                )}
                {description && (
                  <DialogDescription className="mt-1 text-gray-600">
                    {description}
                  </DialogDescription>
                )}
              </div>
              {showCloseButton && (
                <button
                  onClick={onClose}
                  className="h-8 w-8 flex items-center justify-center rounded-md hover:opacity-70 transition-opacity"
                  aria-label="关闭"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Body - 可滚动内容区 */}
        <div
          className={clsx(
            "min-h-0 flex-1 overflow-y-auto",
            footer ? "max-h-[calc(100vh-260px)]" : "max-h-[calc(100vh-180px)]",
            paddingMap[contentPadding]
          )}
        >
          <div className={clsx(footer ? "pb-12" : "pb-6")}>
            {children}
          </div>
        </div>

        {/* Footer - sticky，操作按钮始终可触达 */}
        {footer && (
          <div
            className={clsx(
              "sticky bottom-0 z-10 border-t border-gray-200 bg-white shadow-sm pt-4",
              paddingMap[contentPadding],
              "flex justify-end gap-3"
            )}
          >
            {footer}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export interface ConfirmModalProps extends Omit<ModalProps, "footer"> {
  confirmText?: string
  cancelText?: string
  onConfirm: () => void
  variant?: "default" | "destructive"
  isLoading?: boolean
}

export function ConfirmModal({
  confirmText = "确认",
  cancelText = "取消",
  onConfirm,
  variant = "default",
  isLoading = false,
  contentPadding = "md",
  size = "md",
  ...props
}: ConfirmModalProps) {
  return (
    <Modal
      {...props}
      size={size}
      contentPadding={contentPadding}
      footer={
        <div className="flex justify-end gap-2 w-full">
          <Button
            variant="outline"
            onClick={props.onClose}
            disabled={isLoading}
          >
            {cancelText}
          </Button>
          <Button
            variant={variant === "destructive" ? "destructive" : "default"}
            onClick={onConfirm}
            isLoading={isLoading}
          >
            {confirmText}
          </Button>
        </div>
      }
    />
  )
}