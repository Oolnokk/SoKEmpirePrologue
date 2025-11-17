# Quick-attack Lower Arm Visibility Investigation

**Update:**  
The root phenomenon has been identified: during the strike phase of combo attacks, the coordinates of the ends of the lower arm bones become N/A (not available/undefined). There are no separate hand bones—the lower arm sprite visually includes the hands. This explains the apparent disappearance of fighter hands (lower arms) whenever quick attack or combo animations play.

Previous enumerations of plausible causes have been removed for clarity and focus. Investigations now center on how and why lower arm bone endpoints become invalid (N/A) at the relevant phases.

If more findings emerge or technical notes are needed, they can be added here.
