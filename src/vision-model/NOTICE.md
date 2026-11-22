# On-device landmark models

- MediaPipe Tasks Vision Web runtime 0.10.21, from the official `@mediapipe/tasks-vision` npm package ([package](https://www.npmjs.com/package/@mediapipe/tasks-vision/v/0.10.21), [upstream license](https://github.com/google-ai-edge/mediapipe/blob/v0.10.21/LICENSE)).
- Face Landmarker Float16 version 1 ([model](https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task), [documentation](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker)).
- Hand Landmarker Float16 version 1 ([model](https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task), [documentation](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker)).

Framecut uses the bundled CPU WebAssembly runtime. The files are embedded into the generated HTML and loaded locally.
