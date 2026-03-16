# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - list [ref=e3]
    - navigation [ref=e4]:
      - button "Loading..." [ref=e6] [cursor=pointer]:
        - generic [ref=e8]: Loading...
        - img [ref=e9]
      - button "" [ref=e11] [cursor=pointer]:
        - generic [ref=e12]: 
      - generic [ref=e13]:
        - button "" [ref=e14] [cursor=pointer]:
          - generic [ref=e15]: 
        - button "" [ref=e16] [cursor=pointer]:
          - generic [ref=e17]: 
  - generic [ref=e19]:
    - heading "Update App State?" [level=3] [ref=e20]
    - paragraph [ref=e21]: A shared list has been detected. Would you like to update your local list with the shared one? Your current changes will be overwritten.
    - generic [ref=e22]:
      - button "No" [ref=e23] [cursor=pointer]
      - button "Yes, Update" [ref=e24] [cursor=pointer]
```