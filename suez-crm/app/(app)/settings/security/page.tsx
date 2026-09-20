import { requireUser } from "@/lib/auth";
import { changePassword } from "@/lib/actions/auth";
import { ActionForm, SubmitBtn } from "@/components/form";
import { Card, CardTitle, Field, PageHeader } from "@/components/ui";

export const metadata={title:"Security"};
export default async function SecurityPage({searchParams}:{searchParams:Promise<{first_login?:string}>}){await requireUser();const {first_login}=await searchParams;return <><PageHeader title="Account security" subtitle="Change your password and keep your account secure."/><Card className="max-w-xl"><CardTitle>Change password</CardTitle>{first_login&&<p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-800">Your account has a temporary password. Set a new one now; you will be signed out and need to sign in again.</p>}<ActionForm action={changePassword} reset className="space-y-4"><Field label="Current password"><input name="current_password" type="password" required className="field"/></Field><Field label="New password"><input name="new_password" type="password" minLength={8} required className="field"/></Field><Field label="Confirm new password"><input name="confirm_password" type="password" minLength={8} required className="field"/></Field><SubmitBtn>Update password</SubmitBtn></ActionForm></Card></>}
