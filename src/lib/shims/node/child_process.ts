export const spawn = () => ({
  stdout: { on: () => {} },
  stderr: { on: () => {} },
  on: () => {},
  kill: () => {}
});
export default { spawn };
