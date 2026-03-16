# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - list [ref=e3]
    - navigation [ref=e4]:
      - button "Loading... " [ref=e6] [cursor=pointer]:
        - generic [ref=e8]: Loading...
        - generic [ref=e9]: 
      - button "" [ref=e10] [cursor=pointer]:
        - generic [ref=e11]: 
      - generic [ref=e12]:
        - button "" [ref=e13] [cursor=pointer]:
          - generic [ref=e14]: 
        - button "" [ref=e15] [cursor=pointer]:
          - generic [ref=e16]: 
  - text: 
  - generic [ref=e18]:
    - heading "Update App State?" [level=3] [ref=e19]
    - paragraph [ref=e20]: A shared list has been detected. Would you like to update your local list with the shared one? Your current changes will be overwritten.
    - generic [ref=e21]:
      - button "No" [ref=e22] [cursor=pointer]
      - button "Yes, Update" [ref=e23] [cursor=pointer]
```