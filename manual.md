# PairDev Manual

PairDev is a browser-based remote pair-programming tool for two people. It combines a shared code editor, driver and navigator roles, a shared terminal, a collaborative whiteboard, code annotation, GitHub import for public repositories, and session analytics.

## 1. Start a session

There are two ways to begin using PairDev:

- **Create a room** to start a new collaborative session.
- **Join a room** using a room code shared by another user.

<p align="center">
  <img src="./docs/images/landing_page_cropped.png" alt="PairDev landing page" width="800">
</p>

After selecting or creating a room, enter your display name.

- This name is shown to the other participant.
- It helps identify you in the people list, role controls, and live collaboration features.

<p align="center">
  <img src="./docs/images/Name_prompt_small.png" alt="Display name prompt" width="520">
</p>

### Notes

- Room codes should follow the format `xxx-xxx-xxx`.
- PairDev shows an error toast if the room code format is invalid.
- PairDev also shows an error toast if the room does not exist yet.

<p align="center">
  <img src="./docs/images/ui_toast_err_invalid_room_code.png" alt="Invalid room code toast" width="420">
</p>

<p align="center">
  <img src="./docs/images/ui_toast_err_room_not_found.png" alt="Room not found toast" width="420">
</p>

## 2. Understand the workspace

The main workspace is divided into four core areas:

- **Sidebar**
  - shows participants
  - opens analytics
  - opens settings
  - ends the session
- **Code editor**
  - main programming area
  - shared between participants
- **Terminal**
  - shows execution output
  - shared between participants
- **Collaborative whiteboard**
  - used for diagrams, sketches, and visual explanation

<p align="center">
  <img src="./docs/images/workspace_labeled.png" alt="Workspace overview" width="900">
</p>

### What the top toolbar is used for

The toolbar gives access to important session actions, such as:

- running code
- sharing the invite link
- opening language-related controls

<p align="center">
  <img src="./docs/images/workspace.png" alt="PairDev workspace" width="900">
</p>

## 3. Understand roles

PairDev uses two main roles:

- **Driver**
  - can edit the code
  - is responsible for writing the code
- **Navigator**
  - cannot edit the code
  - reviews the work and guides the session

When your role changes, PairDev explains it through both a dialog and a toast.

<p align="center">
  <img src="./docs/images/driver_notification.png" alt="Driver role dialog" width="560">
</p>

<p align="center">
  <img src="./docs/images/navigator_notification.png" alt="Navigator role dialog" width="560">
</p>

<p align="center">
  <img src="./docs/images/ui_toast_driver.png" alt="Driver role toast" width="420">
</p>

<p align="center">
  <img src="./docs/images/ui_toast_navigator.png" alt="Navigator role toast" width="420">
</p>

### Role rules

- Only the **room owner** can change roles.
- Only one participant can be the **driver** at a time.
- A navigator stays in **read-only** mode in the editor.

## 4. Collaborate in the editor

The code editor is the main work area.

- The **driver** writes and edits the code.
- The **navigator** sees updates in real time.
- Both participants can discuss the code while looking at the same shared document.

<p align="center">
  <img src="./docs/images/code_editor.png" alt="Code editor" width="760">
</p>

### Live collaboration cues

PairDev also shows live presence information in the editor, such as:

- the collaborator's cursor label
- text highlight around the active area
- visual indication of where the other participant is working

<p align="center">
  <img src="./docs/images/ui_text_highlight_cursor.png" alt="Live cursor and highlight" width="520">
</p>

## 5. Use the participant list and follow mode

The people panel helps you understand who is in the room and who controls the session.

It shows:

- participant names
- the room owner
- your own identity
- whether follow mode is available

<p align="center">
  <img src="./docs/images/participants.png" alt="People panel with follow button" width="240">
</p>

### Follow mode

When you are the **navigator**, you can use **Follow** to keep your editor view aligned with the driver.

This is useful when you want to:

- stay focused on the same part of the code
- avoid manually searching for the driver’s current location
- follow the flow of the session more easily

## 6. Select a language and run code

Before running code, choose the programming language from the language selector.

Supported languages include:

- JavaScript
- TypeScript
- Python
- Java
- C
- C++
- C#
- Go
- Rust
- Ruby
- PHP
- Bash

<p align="center">
  <img src="./docs/images/language_selection.png" alt="Language selector" width="260">
</p>

Then:

1. write code directly in the editor, or
2. import code from a public GitHub repository,
3. click **Run**.

The result appears in the shared terminal for both participants.

<p align="center">
  <img src="./docs/images/terminal_cropped.png" alt="Shared terminal output" width="500">
</p>

## 7. Use code annotation

Code annotation lets you draw directly over the editor.

Use it to:

- point out mistakes
- highlight important lines
- mark suspicious logic
- explain code visually during discussion

<p align="center">
  <img src="./docs/images/ui_code_annotation.png" alt="Code annotation" width="760">
</p>

## 8. Use the collaborative whiteboard

The collaborative whiteboard is a separate shared space for drawing.

It is useful for:

- tree structures
- diagrams
- sketches
- algorithm explanations
- general visual discussion that does not need to sit directly on top of the code

<p align="center">
  <img src="./docs/images/whiteboard.png" alt="Collaborative whiteboard" width="720">
</p>

### Whiteboard tools

The whiteboard and annotation tools include:

- colour selection
- brush size control
- pen tool
- eraser tool
- clear action
- export to PNG
- export to JPG

<p align="center">
  <img src="./docs/images/drawing_tools.png" alt="Drawing tools" width="220">
</p>

## 9. Open settings and manage roles

The settings modal provides both general preferences and room controls.

### General settings

From the general settings tab, you can change the visual theme:

- **Light mode**
- **Dark mode**
- **System**

<p align="center">
  <img src="./docs/images/theme_settings.png" alt="Theme settings" width="760">
</p>

### Manage roles

From the manage roles tab, the room owner can:

- inspect current participants
- see who is the driver or navigator
- update roles during the session

<p align="center">
  <img src="./docs/images/manage_role_settings.png" alt="Manage roles" width="760">
</p>

## 10. View analytics

PairDev provides a session summary after or during a session.

The analytics view shows:

- total session duration
- your active time
- time spent as driver
- time spent as navigator
- role contribution for participants

<p align="center">
  <img src="./docs/images/analytics.png" alt="Session analytics" width="620">
</p>

## 11. End the session

When the session is finished, the owner can end it for everyone.

Before the room closes, PairDev shows a confirmation dialog so that the action is not triggered accidentally.

<p align="center">
  <img src="./docs/images/ui_end_session.png" alt="End session confirmation" width="520">
</p>

## 12. Quick tips

- Share the invite link after creating a room.
- Use the collaborative whiteboard for diagrams.
- Use the annotation tool for code-focused discussion.
- Use follow mode when the navigator wants to stay aligned with the driver.
- Check the participant list to confirm who is the owner and who is the driver.
- If GitHub import is used, only public repositories are supported.

## 13. Common issues

### I cannot edit the code

Possible reason:

- You are currently the **navigator**.

What to do:

- Ask the owner to switch your role to **driver**.

### The room does not open

Possible reasons:

- The room code format is invalid.
- The room does not exist yet.

What to do:

- Check the room code.
- Ask the host to create the room again.

### GitHub import does not work

Possible reasons:

- The repository is private.
- The URL is invalid.

What to do:

- Make sure the repository is public.
- Check that the GitHub URL is correct.

### I lost ownership after reopening

Possible reason:

- Ownership recovery depends on the current browser session.

What to do:

- Reopen the room in the same browser session if possible.
- Avoid clearing session data during an active session.
