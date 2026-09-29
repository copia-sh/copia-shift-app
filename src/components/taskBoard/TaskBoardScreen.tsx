import { useTaskBoard } from "../../hooks/useTaskBoard";
import { isTaskUpdateAvailable, submitTaskUpdate } from "../../firebase/taskUpdate";
import { TaskBoardView, type TaskBoardViewProps } from "./TaskBoardView";

export type TaskBoardScreenProps = Omit<TaskBoardViewProps, "state" | "fixedNow" | "initialScope" | "initialSelectedKey" | "onSubmitUpdate">;

/** タスク画面。表示している間だけ `taskBoard/current` を購読する。 */
export function TaskBoardScreen(props: TaskBoardScreenProps) {
  const state = useTaskBoard(props.groupId, true);
  return (
    <TaskBoardView {...props} state={state} onSubmitUpdate={isTaskUpdateAvailable ? submitTaskUpdate : undefined} />
  );
}
