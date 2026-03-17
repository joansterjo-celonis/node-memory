import * as React from "react"
import { cn } from "@/lib/utils"
import { InboxIcon } from "lucide-react"

interface EmptyProps extends React.HTMLAttributes<HTMLDivElement> {
  description?: React.ReactNode;
  icon?: React.ReactNode;
}

function Empty({ className, description, icon, children, ...props }: EmptyProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-8 text-center",
        className
      )}
      {...props}
    >
      {icon ?? <InboxIcon className="h-10 w-10 text-muted-foreground/40 mb-3" />}
      {description && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}
      {children}
    </div>
  )
}

export { Empty }
