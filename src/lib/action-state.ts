/** Standard return type for admin forms using useActionState. */
export type ActionState = { ok: boolean; message: string } | null;

export type FormAction = (
  prev: ActionState,
  formData: FormData,
) => Promise<ActionState>;

export function actionOk(message: string): ActionState {
  return { ok: true, message };
}

export function actionErr(message: string): ActionState {
  return { ok: false, message };
}
