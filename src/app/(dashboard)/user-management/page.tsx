import { redirect } from "next/navigation";

export default function UserManagementIndexPage() {
  redirect("/user-management/users");
}
