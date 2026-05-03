import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Component } from '@angular/core';
import { Observable } from 'rxjs';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-contactus',
  templateUrl: './contactus.component.html',
  styleUrl: './contactus.component.scss'
})
export class ContactusComponent {


  private apiUrl = 'https://test.glintcloudshops.com/api/sendEmail';
  private recipientEmail = 'info@ennwin.in'; // Replace with actual recipient email
  private templateUrl = 'https://evochem.co.in/assets/templates/contactus.html'; // Replace with the actual URL

  contactForm: FormGroup;

  constructor(private fb: FormBuilder, private http: HttpClient, private toastr: ToastrService) {
    this.contactForm = this.fb.group({
      fullName: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      mobileNumber: ['', [Validators.required, Validators.pattern(/^[0-9]{10}$/)]],
      message: ['', Validators.required],
      businessName: [''],
      industry: ['']
    });
  }

  /** Returns true when a control is invalid AND the user has interacted with it OR the form has been submitted. */
  isInvalid(controlName: string): boolean {
    const c = this.contactForm.get(controlName);
    return !!c && c.invalid && (c.touched || c.dirty || this.submitAttempted);
  }

  submitAttempted = false;

  onSubmit() {
    this.submitAttempted = true;
    if (this.contactForm.valid) {
      const formData: FormData = this.contactForm.value;
      console.log('Form Data: ', formData);

      this.sendEmail(formData).subscribe({
        next: () => {
          this.toastr.success('Your message has been sent successfully!', 'Success');
          this.contactForm.reset(); // Clear the form after successful submission
        },
        error: (error) => {
          console.error('Error sending message:', error);
          this.toastr.error('There was an error sending your message. Please try again later.', 'Error');
        }
      });
      
    } else {
      this.toastr.warning('Please fill out the form correctly.', 'Form Invalid');
    }
  }

  sendEmail(formData: FormData): Observable<any> {
    const emailRequest = {
      recipientEmail: this.recipientEmail,
      subject: 'Customer Enquiry From Evochem website',
      htmlS3FileId: 0, // Replace with actual S3 file ID
      templateURl: this.templateUrl,
      templateData: formData
    };

    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'x-tenant': 'default-t'
    });

    return this.http.post(this.apiUrl, JSON.stringify(emailRequest), { headers });
  }

 

}

export interface FormData {
  fullName: string;
  email: string;
  mobileNumber: string;
  businessName: string;
  industry: string;
  message: string;
}
