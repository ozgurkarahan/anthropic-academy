Your task is to create a new worktree named $ARGUMENTS in the .trees/$ARGUMENTS folder.
Follow these steps:

Check if an existing folder in the .trees folder with the name $ARGUMENTS already exists. If it does, stop here and tell the user the worktree already exists.
Create a new git worktree in the .trees folder with the name $ARGUMENTS
Symlink the .venv folder into the worktree directory
Launches a new VSCode editor instance in that directory by running the 'code' command