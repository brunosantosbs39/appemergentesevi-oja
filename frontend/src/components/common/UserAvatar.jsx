import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { imgUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

export const initials = (name) =>
  (name || "?").split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

export const UserAvatar = ({ user, className, ring = false, testid }) => (
  <Avatar
    data-testid={testid}
    className={cn("h-10 w-10 shrink-0", ring && "ring-2 ring-foreground ring-offset-2 ring-offset-white", className)}
  >
    {user?.avatar && <AvatarImage src={imgUrl(user.avatar)} alt={user?.name} className="object-cover" />}
    <AvatarFallback className="bg-secondary font-heading text-xs font-bold text-foreground">
      {initials(user?.name)}
    </AvatarFallback>
  </Avatar>
);
