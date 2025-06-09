export type TimeEntry = {
  id: number;
  description: string;
  project_name: string;
  project_color: string;
  start: string;
  stop: string;
  duration: number;
};

export type Project = {
  id: number;
  name: string;
  color: string;
};

export type SelectedCell = {
  rowIndex: number;
  cellIndex: number;
} | null;
