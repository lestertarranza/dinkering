/** Standard return type for admin forms using useActionState. */
export type ActionState = {
  ok: boolean;
  message: string;
  redirectTo?: string;
} | null;

export type FormAction = (
  prev: ActionState,
  formData: FormData,
) => Promise<ActionState>;

export function actionOk(message: string, redirectTo?: string): ActionState {
  return redirectTo ? { ok: true, message, redirectTo } : { ok: true, message };
}

export function actionErr(message: string): ActionState {
  return { ok: false, message };
}
